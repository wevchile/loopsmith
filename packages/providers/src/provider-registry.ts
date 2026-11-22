import type { MusicProvider, ProviderConfig } from './provider.js';
import { GeminiLyriaProvider } from './gemini-lyria.js';

export class ProviderRegistry {
  private providers = new Map<string, MusicProvider>();
  /** Configuration problems that prevented a provider from being registered (for example an unsupported LYRIA_MODEL). */
  readonly errors: string[] = [];

  registerProvider(provider: MusicProvider): void {
    this.providers.set(provider.id, provider);
  }

  getProvider(id: string): MusicProvider | undefined {
    return this.providers.get(id);
  }

  getDefaultProvider(): MusicProvider | undefined {
    return this.providers.values().next().value;
  }

  listProviders(): MusicProvider[] {
    return Array.from(this.providers.values());
  }

  /** Registers every provider whose configuration is present. Missing keys simply skip a provider. */
  static createDefault(config: ProviderConfig): ProviderRegistry {
    const registry = new ProviderRegistry();

    if (config.apiKey) {
      try {
        registry.registerProvider(new GeminiLyriaProvider(config));
      } catch (error) {
        registry.errors.push(error instanceof Error ? error.message : String(error));
      }
    }

    return registry;
  }
}
