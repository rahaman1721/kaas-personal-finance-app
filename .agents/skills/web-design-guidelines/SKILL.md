---
name: web-design-guidelines
description: Review UI code for Web Interface Guidelines compliance. Use when asked to "review my UI", "check accessibility", "audit design", "review UX", or "check my site against best practices".
---

# Web Interface Guidelines

Review application components and pages for compliance with Web Interface Guidelines and accessibility (a11y) standards.

## Audit Checklist
1. **Accessibility & Contrast**:
   - Verify color contrast passes WCAG AA standards (minimum 4.5:1 for normal text, 3:1 for large text).
   - Ensure interactive elements have explicit accessible names and ARIA labels where iconography is used without text.
2. **Touch Targets & Spacing**:
   - Minimum interactive target size of 44x44px for mobile interfaces.
   - Appropriate hit slop and padding on buttons, icons, and list items.
3. **Form & Data Inputs**:
   - Visible labels and clear error messaging.
   - Appropriate virtual keyboard types (`inputmode="decimal"`, `inputmode="numeric"`, `type="date"`).
4. **Layout & Viewport**:
   - Fluid typography and responsive flex/grid wrappers that gracefully adapt from 320px width up to desktop screens.
   - Proper safe area handling (`env(safe-area-inset-top)` and `env(safe-area-inset-bottom)`) for native mobile status bars and navigation notches.
