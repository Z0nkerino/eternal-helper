# Third-party licenses

Eternal Helper's own code, design, characters (Cloudy, Afina's orb) and icons are © 2026 Eternal Inc.
These open-licensed assets are bundled with the app:

## Microsoft Fluent Emoji (3D) — MIT

- What: the colour 3D emoji in `apps/desktop/public/emoji/` (215 selected emoji, WebP).
- Source: Microsoft Fluent Emoji, https://github.com/microsoft/fluentui-emoji, packaged as
  `@lobehub/fluent-emoji-3d` 1.1.0 (https://github.com/lobehub/fluent-emoji). Regenerate with `node apps/desktop/scripts/emoji.mjs <package dir>`.

```
MIT License

Copyright (c) Microsoft Corporation.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE
```

## Meteocons (animated weather icons) — MIT

- What: the animated SVG weather icons in `apps/desktop/public/weather/`.
- Source: Meteocons by Bas Milius, https://github.com/basmilius/weather-icons (`@bybas/weather-icons` 2.0.0).

```
MIT License

Copyright (c) 2020-2021 Bas Milius

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## Data services (not bundled; called at runtime, no keys)

- Weather and air quality: Open-Meteo (https://open-meteo.com), CC BY 4.0 data.
- Currency rates: ExchangeRate-API open access (https://www.exchangerate-api.com) — attribution shown in Settings.
- Public holidays: Nager.Date (https://date.nager.at).
- Synced lyrics: LRCLIB (https://lrclib.net).
