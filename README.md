# KaasApp — Premium Personal Expense & Finance Tracker

An offline-first, mobile-optimized personal finance and expense tracking application built for Android and modern web browsers.

## Architecture & Technology Stack
- **Framework**: React 19 (`react`, `react-dom`)
- **Language**: TypeScript with strict typing
- **Bundler & Tooling**: Vite 8
- **Mobile Runtime**: Capacitor 8 (Android WebView with native bridge)
- **OCR Engine**: Tesseract.js with canvas-based thresholding and contrast preprocessing
- **Styling**: Vanilla CSS tokens, glassmorphism, adaptive mobile viewport
- **Icons**: Bundled offline Material Symbols Outlined font

## Project Structure
```
KaasApp/
├── .agents/             # Antigravity project customizations (skills, rules, MCP)
├── android/             # Capacitor Android native project & Gradle build
├── public/              # Static assets (icons, splash video, models)
├── src/
│   ├── App.tsx          # Main application component & screens
│   ├── db.ts            # Local storage, schema, and persistent state management
│   ├── index.css        # Global CSS variables, glassmorphic styling, animations
│   └── main.tsx         # React root mounting and font imports
├── GEMINI.md            # Antigravity permanent development rules
├── README.md            # Project documentation & commands
├── STATUS.md            # Milestones and skills verification log
└── capacitor.config.ts  # Capacitor mobile configuration
```

## Setup & Development Commands
- **Install Dependencies**: `npm install`
- **Run Local Web Server**: `npm run dev`
- **Build Web Bundle**: `npm run build`
- **Sync Native Android**: `npx cap sync android`
- **Build Android APK**:
  ```powershell
  cd android
  .\gradlew.bat assembleDebug
  ```
