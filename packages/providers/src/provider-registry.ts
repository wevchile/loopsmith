import type { MusicProvider, ProviderConfig } from './provider.js';
import { GeminiLyriaProvider } from './gemini-lyria.js';

export class ProviderRegistry {
  private providers = new Map<string, MusicProvider>();

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
      registry.registerProvider(new GeminiLyriaProvider(config));
    }

    return registry;
  }
}
