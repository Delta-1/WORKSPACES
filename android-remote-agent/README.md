# Workspace Remote para Android

Agente Android de acesso remoto do Workspace. A sessão é sempre visível e depende
das permissões concedidas no próprio aparelho.

## O que o MVP faz

- registra o celular e mostra um código de acesso de 9 dígitos;
- compartilha a tela após a confirmação do Android;
- mantém uma notificação persistente com o botão **Encerrar**;
- permite toques, gestos, digitação e teclas globais quando a pessoa ativa o
  serviço de Acessibilidade;
- permite navegar somente na pasta escolhida pela pessoa no seletor do Android;
- fornece ao Orb uma captura nítida, separada da prévia leve do visualizador.

O aplicativo não oculta a sessão, não inicia captura de tela no boot e não tenta
contornar as permissões do Android. Em Android 14 ou posterior, uma nova
autorização de captura é solicitada a cada sessão.

## Gerar o APK

Antes do build, configure `WORKSPACE_SUPABASE_URL` e
`WORKSPACE_SUPABASE_ANON_KEY`. No GitHub, cadastre os dois valores em
**Settings → Secrets and variables → Actions**. As credenciais não ficam
armazenadas no código-fonte nem no histórico do repositório.

No GitHub, abra **Actions → Android Remote APK → Run workflow**. Ao final, baixe o
artefato `workspace-remote-android-debug`, que contém o APK instalável.

Para gerar localmente, use JDK 17, Android SDK 35 e Gradle 8.9:

```bash
export WORKSPACE_SUPABASE_URL="https://seu-projeto.supabase.co"
export WORKSPACE_SUPABASE_ANON_KEY="sua-chave-publica-anon"
gradle --no-daemon :app:assembleDebug
```

O arquivo será criado em `app/build/outputs/apk/debug/app-debug.apk`.
