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

  listProviders(): MusicProvider[] {
    return Array.from(this.providers.values());
  }

  static createDefault(config: ProviderConfig): ProviderRegistry {
    const registry = new ProviderRegistry();
    
    if (config.apiKey) {
      try {
        const lyriaProvider = new GeminiLyriaProvider(config);
        registry.registerProvider(lyriaProvider);
      } catch (error) {
        console.error('Failed to initialize Gemini Lyria provider:', error);
      }
    }

    return registry;
  }
}
