import { createHash } from "node:crypto";
import { readFile, rename, writeFile } from "node:fs/promises";

const CACHE_FILENAME = "classical-cn-cache.json";

interface CacheEntry {
	key: string;
	value: string;
	storedAt: number;
}

interface CacheData {
	version: number;
	entries: CacheEntry[];
}

const MAX_ENTRIES = 128;
const MAX_ENTRY_SIZE = 51200; // 50KB

export class TranslationCache {
	private map = new Map<string, string>();
	private cachePath: string;

	constructor(agentDir: string) {
		this.cachePath = `${agentDir}/${CACHE_FILENAME}`;
	}

	get(key: string): string | undefined {
		return this.map.get(key);
	}

	set(key: string, value: string): void {
		if (value.length > MAX_ENTRY_SIZE) return;
		// LRU: delete then re-add to move to end (Map preserves insertion order)
		this.map.delete(key);
		this.map.set(key, value);
		// Evict oldest entries if over limit
		while (this.map.size > MAX_ENTRIES) {
			const first = this.map.keys().next();
			if (first.done) break;
			this.map.delete(first.value);
		}
	}

	key(text: string): string {
		return createHash("sha256").update(text, "utf8").digest("hex");
	}

	async load(): Promise<void> {
		try {
			const raw = await readFile(this.cachePath, "utf8");
			const data = JSON.parse(raw) as CacheData;
			if (data.version !== 1) return;
			for (const entry of data.entries) {
				this.map.set(entry.key, entry.value);
			}
		} catch {
			// File missing or corrupt — start with empty cache
		}
	}

	async save(): Promise<void> {
		if (this.map.size === 0) return;
		const entries: CacheEntry[] = [];
		for (const [key, value] of this.map) {
			entries.push({ key, value, storedAt: Date.now() });
		}
		const data: CacheData = { version: 1, entries };
		const tmp = `${this.cachePath}.tmp`;
		await writeFile(tmp, `${JSON.stringify(data, null, 2)}\n`, "utf8");
		await rename(tmp, this.cachePath);
	}
}
