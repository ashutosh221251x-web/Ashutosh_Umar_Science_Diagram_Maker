import fs from 'fs';
import path from 'path';
import { createRepository } from '../repository/index.js';
import { GeminiClient } from '../geminiClient/index.js';
import { GenerationService } from '../generationService/index.js';
import { CONCEPTS } from '../concepts/index.js';

async function main() {
  const repository = createRepository();
  await repository.init();

  const geminiClient = new GeminiClient();
  const generationService = new GenerationService(geminiClient, repository);

  for (const concept of CONCEPTS) {
    const existing = await repository.getDiagram(concept.id);
    const passedCount = existing ? Object.values(existing.checks).filter(c => c.passed).length : 0;
    if (existing && passedCount === 5) {
      console.log(`Concept ${concept.name} (${concept.id}) is already 5/5 PASSED.`);
      continue;
    }

    console.log(`Generating Concept ${concept.name} (${concept.id})...`);
    try {
      const { result } = await generationService.generate(concept.id);
      const passed = Object.values(result.checks).filter(c => c.passed).length;
      console.log(`Generated ${concept.name}: ${passed}/5 passed`);
    } catch (err: any) {
      console.error(`Error generating ${concept.name}:`, err.message);
    }
  }

  // Export all 5 from database to root results.json
  const allDiagrams = await repository.getAllDiagrams();
  const sorted = CONCEPTS.map(c => allDiagrams.find(d => d.id === c.id)).filter(Boolean);

  const rootResultsPath = path.resolve(process.cwd(), '..', 'results.json');
  const payload = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    results: sorted
  };

  fs.writeFileSync(rootResultsPath, JSON.stringify(payload, null, 2), 'utf-8');
  console.log(`\nExported ${sorted.length} verified DiagramResult objects to ${rootResultsPath}`);
  await repository.close();
}

main().catch(console.error);
