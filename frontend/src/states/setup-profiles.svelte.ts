import { comfyGridApiClient } from '@/api/api-client';
import type { SetupConfig, WorkspaceInfo } from '@/types/setup';

type Intent = { kind: 'select'; id: string } | { kind: 'new' } | { kind: 'duplicate' };
type SetupApi = Pick<typeof comfyGridApiClient, 'getSetupConfig' | 'saveSetupProfile' | 'deleteSetupProfile' | 'postSetupLaunch' | 'postSetupStop'>;

export function blankProfile(): WorkspaceInfo {
    return { name: '', mode: 'launch', script_path: '', python_path: '', comfyui_port: 8188, comfyui_args: '', connect_host: '127.0.0.1', connect_port: 8188 };
}

function plainProfile(profile: WorkspaceInfo): WorkspaceInfo {
    return { ...blankProfile(), ...profile, name: profile.name.trim() };
}

export class SetupProfiles {
    config = $state<SetupConfig>({ workspaces: [], last_workspace: '', connect_port: 8188 });
    draft = $state<WorkspaceInfo>(blankProfile());
    selectedId = $state('');
    baseline = $state('');
    pending = $state<'save' | 'launch' | 'delete' | 'stop' | null>(null);
    error = $state('');
    saved = $state(false);
    intent = $state<Intent | null>(null);
    confirmingDelete = $state(false);

    constructor(private api: SetupApi = comfyGridApiClient) {
        this.baseline = JSON.stringify(plainProfile(this.draft));
    }

    get isNew() {
        return !this.selectedId;
    }
    get dirty() {
        return JSON.stringify(plainProfile(this.draft)) !== this.baseline;
    }
    get isRunning() {
        return Boolean(this.selectedId && this.config.active_profile_id === this.selectedId);
    }

    initialize(config: SetupConfig) {
        this.config = config;
        const selected =
            config.workspaces.find((p) => p.id === config.last_profile_id) ??
            config.workspaces.find((p) => p.name === config.last_workspace) ??
            config.workspaces[0];
        this.select(selected);
    }

    private select(profile?: WorkspaceInfo) {
        this.selectedId = profile?.id ?? '';
        this.draft = plainProfile(
            profile ?? { ...blankProfile(), connect_host: this.config.connect_host ?? '127.0.0.1', connect_port: this.config.connect_port ?? 8188 },
        );
        this.baseline = JSON.stringify(plainProfile(this.draft));
        this.error = '';
        this.saved = false;
    }

    request(intent: Intent) {
        if (this.pending) return;
        if (intent.kind === 'select' && intent.id && intent.id === this.selectedId) return;
        if (this.dirty) this.intent = intent;
        else this.applyIntent(intent);
    }

    private applyIntent(intent: Intent) {
        if (intent.kind === 'select') this.select(this.config.workspaces.find((p) => p.id === intent.id));
        else if (intent.kind === 'duplicate') {
            const copy = plainProfile(this.draft);
            delete copy.id;
            let name = `${copy.name} (copy)`;
            let index = 2;
            while (this.config.workspaces.some((p) => p.name.toLowerCase() === name.toLowerCase())) name = `${copy.name} (copy ${index++})`;
            this.select();
            this.draft = { ...copy, name };
        } else this.select();
        this.intent = null;
    }

    discardAndContinue() {
        if (!this.intent) return;
        const intent = this.intent;
        if (intent.kind === 'duplicate') this.reset();
        this.applyIntent(intent);
    }

    async saveAndContinue() {
        const intent = this.intent;
        if (intent && (await this.save())) this.applyIntent(intent);
    }

    reset() {
        this.select(this.config.workspaces.find((p) => p.id === this.selectedId));
    }

    cancelNew() {
        if (this.pending) return;
        this.request({ kind: 'select', id: this.config.workspaces[0]?.id ?? '' });
    }

    async save(): Promise<boolean> {
        if (this.pending) return false;
        const profile = plainProfile(this.draft);
        if (!profile.name) {
            this.error = 'setup.error.name';
            return false;
        }
        const port = profile.mode === 'connect' ? profile.connect_port : profile.comfyui_port;
        if (!Number.isInteger(port) || Number(port) < 1 || Number(port) > 65535) {
            this.error = 'setup.error.port';
            return false;
        }
        if (profile.mode === 'connect' && !profile.connect_host?.trim()) {
            this.error = 'setup.error.host';
            return false;
        }
        if (profile.mode === 'launch' && (!profile.script_path.trim() || !profile.python_path.trim())) {
            this.error = 'setup.error.paths';
            return false;
        }
        this.pending = 'save';
        this.error = '';
        this.saved = false;
        try {
            const res = await this.api.saveSetupProfile(profile, this.selectedId || undefined);
            if (!res.ok || !res.json.id) throw new Error(res.json.error ?? `HTTP ${res.status}`);
            const saved = res.json;
            const index = this.config.workspaces.findIndex((p) => p.id === saved.id);
            if (index < 0) this.config.workspaces.push(saved);
            else this.config.workspaces[index] = saved;
            this.select(saved);
            this.saved = true;
            return true;
        } catch (error) {
            this.error = error instanceof Error ? error.message : 'setup.error.save';
            return false;
        } finally {
            this.pending = null;
        }
    }

    async launch(): Promise<boolean> {
        if (this.pending) return false;
        if (this.isRunning && !this.dirty) return true;
        if ((this.isNew || this.dirty) && !(await this.save())) return false;
        this.pending = 'launch';
        this.error = '';
        try {
            const res = await this.api.postSetupLaunch(JSON.stringify({ mode: this.draft.mode ?? 'launch', profile_id: this.selectedId }));
            if (!res.ok) throw new Error(res.json.error ?? `HTTP ${res.status}`);
            this.config.active_profile_id = this.selectedId;
            return true;
        } catch (error) {
            this.error = error instanceof Error ? error.message : 'setup.error.launch';
            return false;
        } finally {
            this.pending = null;
        }
    }

    requestDelete() {
        if (!this.pending && !this.isNew && !this.isRunning) this.confirmingDelete = true;
    }

    async delete(): Promise<boolean> {
        if (this.pending || this.isNew || this.isRunning) return false;
        this.pending = 'delete';
        this.error = '';
        const id = this.selectedId;
        const index = this.config.workspaces.findIndex((p) => p.id === id);
        try {
            const res = await this.api.deleteSetupProfile(id);
            if (!res.ok) throw new Error(res.json.error ?? `HTTP ${res.status}`);
            this.config.workspaces = this.config.workspaces.filter((p) => p.id !== id);
            this.select(this.config.workspaces[Math.min(index, this.config.workspaces.length - 1)]);
            this.confirmingDelete = false;
            return true;
        } catch (error) {
            this.error = error instanceof Error ? error.message : 'setup.error.delete';
            this.confirmingDelete = false;
            return false;
        } finally {
            this.pending = null;
        }
    }

    async stop() {
        if (this.pending) return;
        this.pending = 'stop';
        this.error = '';
        try {
            const res = await this.api.postSetupStop();
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            this.config.active_profile_id = null;
        } catch (error) {
            this.error = error instanceof Error ? error.message : 'setup.error.stop';
        } finally {
            this.pending = null;
        }
    }
}
