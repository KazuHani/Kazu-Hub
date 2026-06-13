# Original User Request

## Initial Request — 2026-06-12T23:38:25+01:00

Redesign the glass effect on the Kazu Hub website to match Apple's modern macOS/iOS glassmorphism style, ensuring it is subtle, highly performant, and realistic.

Working directory: c:/Users/rhysd/Documents/GitHub/Kazu Hub
Integrity mode: development

## Requirements

### R1. Glassmorphic Visuals
Implement a premium macOS/iOS-style glass effect. The surface should look like a real frosted glass sheet: high blur (`backdrop-filter: blur(20px)` to `blur(32px)`), subtle semi-transparent white borders (simulating light catching the physical glass edge), and soft inner/outer shadows to create realistic depth against the background. Avoid cartoonish, over-saturated, or plastic-like specular glares.

### R2. Performance & Responsiveness
The entire effect must run in hardware-accelerated pure CSS/SVG, ensuring zero performance lag (smooth 60fps scrolling and hover animations). It must be fully responsive and work seamlessly across both desktop and mobile layouts.

### R3. Hover and Interaction
Implement subtle, natural hover and active state transitions (such as a slight scale lift or border-color shift) that feel organic and premium, avoiding sudden or extreme transformations.

## Acceptance Criteria

### Aesthetic & Quality
- [ ] Cards look like genuine frosted glass panels with soft, realistic translucent edges (no harsh or muddy color borders).
- [ ] Specular highlights and glows are subtle and natural, resembling light reflection rather than a glossy plastic dome.
- [ ] The backdrop is cleanly blurred and readable, with no visual artifacts.

### Performance & Responsiveness
- [ ] No canvas rendering elements or heavy animation frames in JavaScript (scrolling and mouse interactions must be buttery smooth at 60fps+).
- [ ] Mobile layout displays the glass effect correctly without visual issues or performance hits.
