const HISTORY_LEN = 60;

const mkHistory = () => new Array<number>(HISTORY_LEN).fill(0);

interface CpuInfo {
    total: number;
    per_core: number[];
    freq_mhz: number | null;
}
interface RamInfo {
    used_gb: number;
    total_gb: number;
    pct: number;
}
interface GpuInfo {
    available: boolean;
    name?: string;
    gpu_pct?: number;
    vram_used?: number;
    vram_total?: number;
    vram_pct?: number;
    temp_c?: number;
}

interface Snapshot {
    cpu: CpuInfo;
    ram: RamInfo;
    gpu: GpuInfo;
}

class SystemState {
    #connected: boolean = false;
    #eventSource: EventSource = null;
    #activeCount: number = 0;

    #cpu: CpuInfo = $state({ total: 0, per_core: [], freq_mhz: null });
    #ram: RamInfo = $state({ used_gb: 0, total_gb: 0, pct: 0 });
    #gpu: GpuInfo = $state({ available: false });
    readonly #cpuHistory: number[] = $state(mkHistory());
    readonly #ramHistory: number[] = $state(mkHistory());
    readonly #gpuHistory: number[] = $state(mkHistory());
    readonly #vramHistory: number[] = $state(mkHistory());
    readonly #tempHistory: number[] = $state(mkHistory());

    #error = $state<string | null>(null);

    get connected() {
        return this.#connected;
    }
    get cpu() {
        return this.#cpu;
    }
    get ram() {
        return this.#ram;
    }
    get gpu() {
        return this.#gpu;
    }
    get cpuHistory() {
        return this.#cpuHistory;
    }
    get ramHistory() {
        return this.#ramHistory;
    }
    get gpuHistory() {
        return this.#gpuHistory;
    }
    get vramHistory() {
        return this.#vramHistory;
    }
    get tempHistory() {
        return this.#tempHistory;
    }
    get error() {
        return this.#error;
    }

    startMonitoring() {
        this.#activeCount++;
        if (this.#eventSource) return;
        this.#connect();
    }

    #connect() {
        if (this.#eventSource) return;

        this.#eventSource = new EventSource('/comfygrid/api/stats/stream');
        this.#eventSource.onopen = () => {
            this.#connected = true;
            this.#error = null;
        };
        this.#eventSource.onmessage = (e: MessageEvent) => {
            const d: Snapshot = JSON.parse(e.data);
            this.#cpu = d.cpu;
            this.#ram = d.ram;
            this.#gpu = d.gpu;
            this.#cpuHistory.push(d.cpu.total);
            this.#cpuHistory.shift();
            this.#ramHistory.push(d.ram.pct);
            this.#ramHistory.shift();
            this.#gpuHistory.push(d.gpu.gpu_pct ?? 0);
            this.#gpuHistory.shift();
            this.#vramHistory.push(d.gpu.vram_pct ?? 0);
            this.#vramHistory.shift();
            this.#tempHistory.push(d.gpu.temp_c ?? 0);
            this.#tempHistory.shift();
        };
        this.#eventSource.onerror = () => {
            this.#connected = false;
            this.#error = 'Connection Error';
            this.#eventSource?.close();
            this.#eventSource = null;
            if (this.#activeCount > 0) {
                setTimeout(() => this.#connect(), 3000);
            }
        };
    }

    stopMonitoring() {
        if (this.#activeCount > 0) {
            this.#activeCount--;
        }

        if (this.#activeCount === 0 && this.#eventSource) {
            this.#connected = false;
            this.#eventSource.close();
            this.#eventSource = null;
        }
    }
}

export const systemState = new SystemState();
