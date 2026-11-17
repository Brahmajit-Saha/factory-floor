# OPSPHERE game design guide (inferred from OPS in One Word and Supply Chain Simulator)

**Colour tokens:** primary #4F24B2 (hover #6234C9) · navy #1C0B55 · panel-2 #271272 · line #3D2C8A · void #0D0430 · page bg #150842 with a #3B1F96 glow at the top · violet #8F6BFF / #B9A6FF · text #F3F0FF · muted #A9A0D6 · good #3fe08f · warn #ffb23e · bad #ff4d6d.
**Fonts:** Chakra Petch (headings, brand text), Inter (body), JetBrains Mono (numbers, clocks, scores).
**Header (fixed, every screen):** dark bar (void, 88% opaque, blur, bottom line). Left: club logo on a light chip + "OPSPHERE" wordmark, letter-spaced. Centre: game name, uppercase, muted (hidden on phones). Right: IBS logo on a white chip.
**Watermark:** club logo, centred, ~22% opacity, brightened, behind every screen.
**Footer (fixed, every screen):** small centred muted line with the developer credit. Never removed.
**Components:** panels are navy gradient with a line border and 14–16px radius. Primary button = solid purple, white text. Default button = transparent with a line border that turns purple on hover. Inputs sit on void with a purple focus ring. Status colours carry meaning only (good, warn, bad).
