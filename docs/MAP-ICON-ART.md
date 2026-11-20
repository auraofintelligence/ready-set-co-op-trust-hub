# Map icon artwork

Generated for Ready SETCO on 20 November 2026 (Australia/Brisbane), following Luke's request for GenAI map-icon sheets covering community clubs, sport, businesses, facilities, public services and events.

## Assets and provenance

These three original, separately generated PNG sheets were produced with the built-in image generation tool. No CLI/API fallback was used. Each original was copied byte-for-byte into the project, with the source retained in the generated-images archive. No raster resizing, cropping or background editing was performed.

All three sheets are **1254 × 1254 pixels, RGBA**, with genuine transparent pixels (alpha range 0–255). Each contains **four columns and four rows** in the documented order. Visual inspection confirmed the requested pictograms; a read-only alpha analysis confirmed all 16 cells contain artwork and all opaque artwork stays within its own cell. The palette follows Ready SETCO's navy, highlighted purple, cyan, yellow and green.

For CSS sprites use `background-size: 400% 400%`; each axis position is `0%`, `33.333333%`, `66.666667%` or `100%`. The native cell size is 313.5px, so use percentage positioning rather than rounded source-pixel offsets. Keep visible text labels and accessible names in the interface. The sheets themselves intentionally contain no labels; the information pictogram uses the conventional lowercase i.

The Indigenous cultural-place pictogram is a generic gathering of people. It does not reproduce traditional designs, identify a custodian or grant permission to publish information about a place. Public-service pictograms are generic, without official insignia, national flags or affiliation claims.

## community-sports

Project asset: `assets/map-icons/community-sports.png`.

Generation source: `C:\Users\Aura2020\.codex\generated_images\01a1f7b6-6672-70c0-8561-c8c73ff0a4e8\exec-3a8889fe-13b1-462b-b158-42426ff7cb2f.png`.

| Row | Column 1 | Column 2 | Column 3 | Column 4 |
| --- | --- | --- | --- | --- |
| 1 | `community_club` | `sports_club` | `rugby` | `soccer` |
| 2 | `cricket` | `tennis` | `bowls` | `golf` |
| 3 | `surf_lifesaving` | `swimming` | `sailing` | `arts` |
| 4 | `music` | `festival` | `indigenous_culture` | `education` |

Prompt used:

```text
Use case: ui-mockup.
Asset type: production map-icon sprite atlas for an all-ages community map.
Create one square 4-by-4 sprite sheet containing EXACTLY 16 separate icons on a truly transparent background, suitable for CSS sprites. Four equal columns and four equal rows. Fixed icon centres at 12.5%, 37.5%, 62.5%, 87.5% of image width and height. Each icon must fit inside the central 65% of its cell, with generous EMPTY transparent gutters. Do not shift cells. No grid lines, no labels, no text except a standard information i if requested, no numbers, no watermark, no extra icons.
Style: one consistent family of bold, simple, friendly flat pictograms, instantly recognisable at 40px for older adults. Crisp dark navy outlines/silhouettes (#101020), balanced accents in purple #8f4dff, cyan #5fd8ff, golden yellow #ffd166, and green #62f6a5. Transparent open space, no shadows, no gradients, no 3D, no textured detail, no emoji faces. Consistent stroke weights and apparent icon size. No national flags, brands, official service insignia or claimed endorsements. No sacred or invented Indigenous art motifs.
Required icons in STRICT row-major order, reading left to right, top to bottom:
Row 1: community club (simple community hall), sports club (generic sports shield), rugby (oval rugby ball), soccer (football).
Row 2: cricket (bat and ball), tennis (racket), lawn bowls (bowls on grass), golf (golf hole flag).
Row 3: surf lifesaving (lifebuoy), swimming (goggles over waves), sailing (sailboat), arts (theatre masks).
Row 4: music (musical note), festival (bunting with a spark), Indigenous cultural place (generic people gathered in a circle, inclusive and abstract, NO traditional or sacred motifs), education (open book).
```

## business-services

Project asset: `assets/map-icons/business-services.png`.

Generation source: `C:\Users\Aura2020\.codex\generated_images\01a1f7b6-6672-70c0-8561-c8c73ff0a4e8\exec-928aa82c-042e-48de-a8d8-2ece42a3f836.png`.

| Row | Column 1 | Column 2 | Column 3 | Column 4 |
| --- | --- | --- | --- | --- |
| 1 | `business` | `cafe` | `restaurant` | `accommodation` |
| 2 | `groceries` | `retail` | `trades` | `office` |
| 3 | `market` | `tourism` | `cinema` | `health` |
| 4 | `pharmacy` | `childcare` | `workshop` | `community_garden` |

Prompt used:

```text
Use case: ui-mockup.
Asset type: production map-icon sprite atlas for an all-ages community map.
Create one square 4-by-4 sprite sheet containing EXACTLY 16 separate icons on a truly transparent background, suitable for CSS sprites. Four equal columns and four equal rows. Fixed icon centres at 12.5%, 37.5%, 62.5%, 87.5% of image width and height. Each icon must fit inside the central 65% of its cell, with generous EMPTY transparent gutters. Do not shift cells. No grid lines, no labels, no text except a standard information i if requested, no numbers, no watermark, no extra icons.
Style: one consistent family of bold, simple, friendly flat pictograms, instantly recognisable at 40px for older adults. Crisp dark navy outlines/silhouettes (#101020), balanced accents in purple #8f4dff, cyan #5fd8ff, golden yellow #ffd166, and green #62f6a5. Transparent open space, no shadows, no gradients, no 3D, no textured detail, no emoji faces. Consistent stroke weights and apparent icon size. No national flags, brands, official service insignia or claimed endorsements. No sacred or invented Indigenous art motifs.
Required icons in STRICT row-major order, reading left to right, top to bottom:
Row 1: business (shopfront), cafe (coffee cup), restaurant (fork and spoon), accommodation (bed).
Row 2: groceries (shopping basket), retail (shopping bag), trades (spanner), office (briefcase).
Row 3: market (market stall), tourism (binoculars), cinema (film projector), health (heart with GREEN medical cross).
Row 4: pharmacy (mortar and pestle), childcare (play blocks), workshop (crossed tools), community garden (sprout).
```

## facilities-public

Project asset: `assets/map-icons/facilities-public.png`.

Generation source: `C:\Users\Aura2020\.codex\generated_images\01a1f7b6-6672-70c0-8561-c8c73ff0a4e8\exec-d100de89-a7e7-4eb4-8378-61de278bd2a8.png`.

| Row | Column 1 | Column 2 | Column 3 | Column 4 |
| --- | --- | --- | --- | --- |
| 1 | `bus_stop` | `ferry` | `picnic` | `seat` |
| 2 | `toilet` | `water` | `beach` | `parking` |
| 3 | `accessible` | `public_service` | `police` | `fire` |
| 4 | `ambulance` | `waste` | `info` | `other` |

Prompt used:

```text
Use case: ui-mockup.
Asset type: production map-icon sprite atlas for an all-ages community map.
Create one square 4-by-4 sprite sheet containing EXACTLY 16 separate icons on a truly transparent background, suitable for CSS sprites. Four equal columns and four equal rows. Fixed icon centres at 12.5%, 37.5%, 62.5%, 87.5% of image width and height. Each icon must fit inside the central 65% of its cell, with generous EMPTY transparent gutters. Do not shift cells. No grid lines, no labels, no text except a standard information i if requested, no numbers, no watermark, no extra icons.
Style: one consistent family of bold, simple, friendly flat pictograms, instantly recognisable at 40px for older adults. Crisp dark navy outlines/silhouettes (#101020), balanced accents in purple #8f4dff, cyan #5fd8ff, golden yellow #ffd166, and green #62f6a5. Transparent open space, no shadows, no gradients, no 3D, no textured detail, no emoji faces. Consistent stroke weights and apparent icon size. No national flags, brands, official service insignia or claimed endorsements. No sacred or invented Indigenous art motifs.
Required icons in STRICT row-major order, reading left to right, top to bottom:
Row 1: bus stop (bus at a shelter), ferry (ferry boat), picnic (picnic table), seat (bench).
Row 2: toilet (clear generic unisex facility pictogram), drinking water (tap and drop), beach (wave and sun), parking (car in a parking space).
Row 3: accessible (wheelchair pictogram), public service (civic building), police (generic police cap and badge, NO official insignia), fire service (fire engine).
Row 4: ambulance (ambulance with GREEN medical symbol), waste (rubbish bin), information (standard lowercase i in circle), another place (location pin).
```


