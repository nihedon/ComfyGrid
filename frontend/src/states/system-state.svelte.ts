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

interface SystemHistory {
    cpu: number[];
    ram: number[];
    gpu: number[];
    vram: number[];
    temp: number[];
}

interface SystemData {
    cpu: CpuInfo;
    ram: RamInfo;
    gpu: GpuInfo;
    history: SystemHistory;
}

class SystemState {
    #connected: boolean = false;
    #eventSource: EventSource = null;
    #activeCount: number = 0;
    #reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    #stats = $state<SystemData>({
        cpu: { total: 0, per_core: [], freq_mhz: null },
        ram: { used_gb: 0, total_gb: 0, pct: 0 },
        gpu: { available: false },
        history: {
            cpu: mkHistory(),
            ram: mkHistory(),
            gpu: mkHistory(),
            vram: mkHistory(),
            temp: mkHistory(),
        },
    });

    #error = $state<string | null>(null);

    get connected() {
        return this.#connected;
    }
    get cpu() {
        return this.#stats.cpu;
    }
    get ram() {
        return this.#stats.ram;
    }
    get gpu() {
        return this.#stats.gpu;
    }
    get cpuHistory() {
        return this.#stats.history.cpu;
    }
    get ramHistory() {
        return this.#stats.history.ram;
    }
    get gpuHistory() {
        return this.#stats.history.gpu;
    }
    get vramHistory() {
        return this.#stats.history.vram;
    }
    get tempHistory() {
        return this.#stats.history.temp;
    }
    get error() {
        return this.#error;
    }

    startMonitoring() {
        this.#activeCount++;
        if (this.#eventSource || this.#reconnectTimer !== null) return;
        this.#connect();
    }

    #connect() {
        if (this.#activeCount === 0 || this.#eventSource) return;

        const source = new EventSource('/comfygrid/api/stats/stream');
        this.#eventSource = source;
        source.onopen = () => {
            if (this.#eventSource !== source) return;
            this.#connected = true;
            this.#error = null;
        };
        source.onmessage = (e: MessageEvent) => {
            if (this.#eventSource !== source) return;
            const d: Snapshot = JSON.parse(e.data);
            const prevHistory = this.#stats.history;

            this.#stats = {
                cpu: d.cpu,
                ram: d.ram,
                gpu: d.gpu,
                history: {
                    cpu: [...prevHistory.cpu.slice(1), d.cpu.total],
                    ram: [...prevHistory.ram.slice(1), d.ram.pct],
                    gpu: [...prevHistory.gpu.slice(1), d.gpu.gpu_pct ?? 0],
                    vram: [...prevHistory.vram.slice(1), d.gpu.vram_pct ?? 0],
                    temp: [...prevHistory.temp.slice(1), d.gpu.temp_c ?? 0],
                },
            };
        };
        source.onerror = () => {
            if (this.#eventSource !== source) return;
            this.#disconnect();
            this.#error = 'Connection Error';
            if (this.#activeCount > 0) {
                this.#reconnectTimer = setTimeout(() => {
                    this.#reconnectTimer = null;
                    this.#connect();
                }, 3000);
            }
        };
    }

    #disconnect() {
        this.#connected = false;
        const source = this.#eventSource;
        this.#eventSource = null;
        if (!source) return;
        source.onopen = null;
        source.onmessage = null;
        source.onerror = null;
        source.close();
    }

    stopMonitoring() {
        if (this.#activeCount > 0) {
            this.#activeCount--;
        }

        if (this.#activeCount === 0) {
            if (this.#reconnectTimer !== null) {
                clearTimeout(this.#reconnectTimer);
                this.#reconnectTimer = null;
            }
            this.#disconnect();
        }
    }
}

export const systemState = new SystemState();
