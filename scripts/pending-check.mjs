const check = process.argv[2];
console.error(`Check ${check ?? 'unknown'} indisponível: etapa ainda não implementada/validada. Consulte docs/evidence/ciclo-01.md.`);
process.exitCode = 1;
