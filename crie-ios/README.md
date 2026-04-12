# CRIE iOS App (Capacitor)

App nativo iOS para o CRIE Member App, gerado via [Capacitor](https://capacitorjs.com/).

## Estrutura

```
crie-ios/
├── www/           ← Web assets (crie-app.html copiado como index.html)
├── ios/           ← Projeto Xcode gerado pelo Capacitor
├── capacitor.config.json
└── package.json
```

## Pré-requisitos

- macOS com Xcode instalado
- CocoaPods: `sudo gem install cocoapods`
- Node.js v18+
- Apple Developer Account ($99/ano)

## Setup Inicial (1x)

```bash
cd crie-ios

# 1. Instalar dependências npm
npm install

# 2. Adicionar plataforma iOS (requer CocoaPods instalado)
npx cap add ios

# 3. Abrir no Xcode
npx cap open ios
```

## Workflow de atualização

Sempre que atualizar o `crie-app.html`:

```bash
cd crie-ios

# Copia o HTML atualizado e sincroniza com Xcode
npm run copy
```

Ou manualmente:
```bash
cp ../frontend/crie-app.html www/index.html
npx cap sync ios
npx cap open ios
```

## Configuração no Xcode

1. **Bundle ID:** `com.zelopro.crie`
2. **Signing & Capabilities:** Seleciona a tua Team da Apple Developer
3. **Deployment Target:** iOS 14.0+
4. **Display Name:** CRIE

## Publicação na App Store

1. No Xcode: **Product → Archive**
2. No Organizer: **Distribute App → App Store Connect**
3. Completa os metadados no [App Store Connect](https://appstoreconnect.apple.com)

## App ID no Apple Developer

Criar em https://developer.apple.com/account/resources/identifiers/list com:
- **Bundle ID:** `com.zelopro.crie`
- **Name:** CRIE Membros

