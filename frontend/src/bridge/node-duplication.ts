import type { ComfyGraph, ComfyNode } from '@/types/comfy-model';
import type { ComfyLink } from '@/types/model-shared';

type DuplicationIssue =
    'duplicate_types' | 'no_matching_ports' | 'unavailable' | 'invalid_link' | 'clone_failed' | 'ports_changed' | 'connection_failed' | 'rollback_failed';

export class NodeDuplicationError extends Error {
    constructor(
        readonly issue: DuplicationIssue,
        options?: ErrorOptions,
    ) {
        super(`Node duplication failed: ${issue}`, options);
    }
}

type Connection = {
    from: ComfyNode;
    output: number;
    to: ComfyNode;
    input: number;
};

type InputPlan = {
    inheritedInputs: Array<{ input: number; connection: Connection }>;
    chainedInputs: Array<{ input: number; output: number }>;
};

export function getNodeDuplicationIssue(node: ComfyNode): DuplicationIssue | undefined {
    if (!node.graph || typeof node.clone !== 'function' || node.subgraph || node.isSubgraphNode?.()) return 'unavailable';
    try {
        planInputs(node);
    } catch (error) {
        return error instanceof NodeDuplicationError ? error.issue : 'invalid_link';
    }
}

function getLink(graph: ComfyGraph, id: number): ComfyLink | undefined {
    if (typeof graph.getLink === 'function') return graph.getLink(id);
    const links = graph.links as { get?: (id: number) => ComfyLink | undefined; [id: number]: ComfyLink };
    return typeof links.get === 'function' ? links.get(id) : links[id];
}

function readConnection(graph: ComfyGraph, id: number): Connection {
    const link = getLink(graph, id);
    const from = link && graph.getNodeById(link.origin_id);
    const to = link && graph.getNodeById(link.target_id);
    if (!link || !from || !to || !from.outputs?.[link.origin_slot] || !to.inputs?.[link.target_slot]) {
        throw new NodeDuplicationError('invalid_link');
    }
    return { from, output: link.origin_slot, to, input: link.target_slot };
}

function connect({ from, output, to, input }: Connection) {
    const link = from.connect<ComfyLink>(output, to, input);
    if (
        !link ||
        String(link.origin_id) !== String(from.id) ||
        link.origin_slot !== output ||
        String(link.target_id) !== String(to.id) ||
        link.target_slot !== input
    ) {
        throw new NodeDuplicationError('connection_failed');
    }
}

function hasSamePorts(source: ComfyNode, clone: ComfyNode): boolean {
    for (const [original, copied] of [
        [source.inputs ?? [], clone.inputs ?? []],
        [source.outputs ?? [], clone.outputs ?? []],
    ]) {
        if (original.length !== copied.length || original.some((slot, index) => slot.type !== copied[index].type || slot.name !== copied[index].name)) {
            return false;
        }
    }
    for (const [index, input] of (source.inputs ?? []).entries()) {
        if (Boolean(input.widget) !== Boolean(clone.inputs[index].widget)) return false;
    }
    return true;
}

function checkClonePorts(source: ComfyNode, clone: ComfyNode) {
    if (!hasSamePorts(source, clone)) throw new NodeDuplicationError('ports_changed');
}

function findSuccessorOutput(source: ComfyNode, input: number, outputs: number[]): number | undefined {
    for (const output of outputs) {
        for (const id of source.outputs[output].links ?? []) {
            const connection = readConnection(source.graph as ComfyGraph, id);
            if (connection.from !== source || connection.output !== output || connection.to === source) {
                throw new NodeDuplicationError('invalid_link');
            }
            if (connection.input === input && connection.to.type === source.type && hasSamePorts(source, connection.to)) {
                return output;
            }
        }
    }
}

function planInputs(source: ComfyNode): InputPlan {
    const graph = source.graph as ComfyGraph;
    const outputsByType = new Map<string | number, number[]>();
    const inputCounts = new Map<string | number, number>();
    for (const [index, slot] of (source.outputs ?? []).entries()) {
        const outputs = outputsByType.get(slot.type) ?? [];
        outputs.push(index);
        outputsByType.set(slot.type, outputs);
    }
    for (const slot of source.inputs ?? []) {
        if (!slot.widget) inputCounts.set(slot.type, (inputCounts.get(slot.type) ?? 0) + 1);
    }

    const plan: InputPlan = { inheritedInputs: [], chainedInputs: [] };
    for (const [input, slot] of (source.inputs ?? []).entries()) {
        const connection = slot.link == null ? undefined : readConnection(graph, slot.link);
        if (connection && (connection.to !== source || connection.input !== input || connection.from === source)) {
            throw new NodeDuplicationError('invalid_link');
        }
        const outputs = slot.widget ? [] : (outputsByType.get(slot.type) ?? []);
        let output: number | undefined;
        if (outputs.length === 1 && inputCounts.get(slot.type) === 1) {
            output = outputs[0];
        } else if (outputs.length > 0) {
            // Prefer predecessor wiring; only consult successors when it cannot resolve this input.
            if (connection && connection.from.type === source.type && hasSamePorts(source, connection.from) && outputs.includes(connection.output)) {
                output = connection.output;
            } else {
                output = findSuccessorOutput(source, input, outputs);
            }
            if (output === undefined) throw new NodeDuplicationError('duplicate_types');
        }
        if (output !== undefined) plan.chainedInputs.push({ input, output });
        else if (connection) plan.inheritedInputs.push({ input, connection });
    }
    if (plan.chainedInputs.length === 0) throw new NodeDuplicationError('no_matching_ports');
    return plan;
}

export function duplicateNodeAfter(source: ComfyNode): ComfyNode {
    const issue = getNodeDuplicationIssue(source);
    if (issue) throw new NodeDuplicationError(issue);
    const graph = source.graph as ComfyGraph;
    if (graph.getNodeById(source.id) !== source) throw new NodeDuplicationError('unavailable');
    const { inheritedInputs, chainedInputs } = planInputs(source);
    const outgoing: Connection[] = [];

    // Snapshot every connection before clone hooks or connect() can alter slot arrays.
    for (const [output, slot] of (source.outputs ?? []).entries()) {
        for (const id of slot.links ?? []) {
            const connection = readConnection(graph, id);
            if (connection.from !== source || connection.output !== output || connection.to === source) throw new NodeDuplicationError('invalid_link');
            outgoing.push(connection);
        }
    }

    const clone = source.clone();
    if (!clone || clone === source) throw new NodeDuplicationError('clone_failed');
    checkClonePorts(source, clone);
    clone.id = -1;
    clone.pos = [source.pos[0], source.pos[1]];

    // Snapshot downstream inputs as well: an extension may redirect connect() to another slot.
    const downstreamInputs = [...new Set(outgoing.map((connection) => connection.to))].flatMap((node) =>
        (node.inputs ?? []).map((slot, input) => ({ node, input, connection: slot.link == null ? undefined : readConnection(graph, slot.link) })),
    );
    graph.beforeChange(source);
    try {
        graph.add(clone);
        if (clone.graph !== graph || graph.getNodeById(clone.id) !== clone) throw new NodeDuplicationError('clone_failed');
        clone.pos = [source.pos[0], source.pos[1]];
        checkClonePorts(source, clone);
        for (const { input, output } of chainedInputs) connect({ from: source, output, to: clone, input });
        for (const { input, connection } of inheritedInputs) connect({ ...connection, to: clone, input });
        for (const connection of outgoing) connect({ ...connection, from: clone });
        return clone;
    } catch (error) {
        const failures: unknown[] = [];
        try {
            if (graph.getNodeById(clone.id) === clone) graph.remove(clone);
        } catch (rollbackError) {
            failures.push(rollbackError);
        }
        for (const { node, input, connection } of downstreamInputs) {
            try {
                const id = node.inputs[input]?.link;
                const current = id == null ? undefined : getLink(graph, id);
                if (connection) {
                    if (!current || String(current.origin_id) !== String(connection.from.id) || current.origin_slot !== connection.output) connect(connection);
                } else if (id != null) {
                    if (!node.disconnectInput(input)) throw new NodeDuplicationError('connection_failed');
                }
            } catch (rollbackError) {
                failures.push(rollbackError);
            }
        }
        if (failures.length) throw new NodeDuplicationError('rollback_failed', { cause: new AggregateError([error, ...failures]) });
        throw error;
    } finally {
        graph.afterChange(source);
        graph.setDirtyCanvas(true, true);
    }
}
