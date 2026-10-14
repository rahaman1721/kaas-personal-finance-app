# GOOGLE ANTIGRAVITY PROJECT RULES — KaasApp

## 1. Environment & Architecture
- **Primary IDE**: Google Antigravity.
- **Stack**: React 19, TypeScript, Vite, Capacitor 8 (Android), Tesseract.js OCR, Material Symbols.
- **Platform**: Cross-platform web & Android native (debug APK via Gradle).

## 2. Permanent Project Guidelines
- **Autonomous Operations**: Safely proceed with non-destructive, reversible implementation and refactoring tasks.
- **Approval Gates**: Always request explicit user approval before:
  - Destructive operations (overwriting major features, deleting files).
  - Production deployments or actions incurring external costs.
  - Adding unverified dependencies or altering security authentication.
- **Design Philosophy**: High-conviction, bespoke design. Reject generic AI styles and standard purple/predictable gradients. Follow mobile-first responsive layout, accessible contrast, and smooth micro-interactions.
- **Testing & Verification**: Always verify builds (`npm run build`), linting, and tests before claiming task completion.

## 3. Tooling & Customizations
- **Skills Directory**: `.agents/skills/`
- **MCP Configuration**: `.agents/mcp_config.json`
- **Memory & Progress Tracker**: `STATUS.md` and `README.md`
