# Voir le contrat dans VSCode (extensions)

## Extensions a installer

- `tomoki1207.pdf` (PDF Viewer): ouvre `server/assets/contrat_template.pdf` directement dans VSCode.
- `ritwickdey.liveserver` (ou `ms-vscode.live-server`): lance une page locale pour l'outil interactif.

## Ouvrir l'outil interactif

1. Lancer le serveur mapper:

```powershell
node scripts/contract-mapper-server.cjs
```

2. Ouvrir dans le navigateur (depuis VSCode terminal):

```powershell
start http://localhost:4177
```

Si `4177` est pris:

```powershell
$env:CONTRACT_MAPPER_PORT=4188
node scripts/contract-mapper-server.cjs
start http://localhost:4188
```