# Rooms and Vocabulary

*Proposed list of the game's rooms and their words. Settles open decision J in [TECHNICAL.md §11](../TECHNICAL.md#11-open-decisions) once agreed. Plan: [TECHNICAL.md §10, M6–M7](../TECHNICAL.md#m6-multiple-rooms-and-performance) · Art: [style guide](art/style-guide.md)*

> **Status: proposal, to agree.** Change any room or word freely before it is painted; after that, changing a word means repainting or masking.

---

## Summary

- **12 rooms, 25 words each:** 227 different words in all. Shared words are written once in the lexicon and reused (e.g. *chair* is in 5 rooms).
- **Order** goes from home to school to outdoors, roughly from the most familiar words to the least.
- **Every word is a visible, everyday thing** that can be painted without text (no signs, calendars, or labels) and clicked on its own.

| # | Room | ID | Status |
|---|------|----|--------|
| 1 | Kitchen | `kitchen` | Painted (real painting, 9 of 25 words masked) |
| 2 | Bedroom | `bedroom` | Placeholder (11 words) |
| 3 | Bathroom | `bathroom` | Placeholder (10 words) |
| 4 | Living room | `living-room` | To do |
| 5 | Classroom | `classroom` | To do |
| 6 | Music room | `music-room` | To do |
| 7 | Playground | `playground` | To do |
| 8 | Garden | `garden` | To do |
| 9 | Grocery store | `grocery-store` | To do |
| 10 | Farm | `farm` | To do |
| 11 | Beach | `beach` | To do |
| 12 | Street | `street` | To do |

*Placeholder* rooms are drawn by `npm run make:placeholder-rooms` so that room selection and switching can be built and tested; each is replaced by a painting following the style guide, with its full word list.

---

## Words per Room

### 1. Kitchen

refrigerator, stove, oven, sink, cupboard, drawer, table, chair, stool, window, clock, kettle, toaster, microwave, pot, pan, plate, bowl, cup, glass, spoon, fork, knife, bottle, apple.

### 2. Bedroom

bed, pillow, blanket, lamp, wardrobe, dresser, desk, chair, book, bookshelf, rug, window, curtain, clock, teddy bear, toy box, ball, doll, picture, mirror, slippers, pajamas, backpack, door, plant.

### 3. Bathroom

sink, toilet, bathtub, shower, mirror, towel, toothbrush, toothpaste, soap, shampoo, sponge, bath mat, toilet paper, hairbrush, comb, cup, cabinet, window, door, laundry basket, scale, rubber duck, faucet, bin, plant.

### 4. Living room

sofa, armchair, coffee table, television, remote control, lamp, rug, cushion, curtain, window, door, bookshelf, book, picture, plant, clock, fireplace, vase, flower, blanket, newspaper, telephone, piano, guitar, stairs.

### 5. Classroom

whiteboard, desk, chair, book, notebook, pencil, pen, eraser, ruler, scissors, glue, crayon, marker, paper, paintbrush, backpack, lunch box, globe, map, computer, clock, window, door, shelf, bin.

### 6. Music room

piano, guitar, drum, violin, cello, harp, trumpet, saxophone, flute, recorder, harmonica, accordion, xylophone, tambourine, maracas, triangle, bell, microphone, headphones, speaker, music stand, radio, stool, chair, rug.

### 7. Playground

slide, swing, seesaw, sandbox, climbing frame, bench, tree, ball, bucket, shovel, bicycle, scooter, jump rope, kite, fence, gate, bin, water fountain, sun, cloud, flower, grass, path, puddle, hat.

### 8. Garden

flower, tree, bush, grass, watering can, hose, shovel, rake, wheelbarrow, flowerpot, fence, gate, bench, birdhouse, pond, rock, path, shed, carrot, tomato, pumpkin, strawberry, sun, cloud, gloves.

### 9. Grocery store

shopping cart, basket, shelf, cash register, bag, freezer, scale, apple, banana, orange, grapes, lemon, carrot, tomato, potato, bread, milk, cheese, egg, juice, cereal, cookie, fish, rice, pasta.

### 10. Farm

barn, tractor, fence, gate, hay, cow, horse, pig, sheep, chicken, duck, goat, dog, cat, rabbit, egg, bucket, wheelbarrow, pond, tree, scarecrow, windmill, pumpkin, carrot, well.

### 11. Beach

sand, sea, wave, sun, cloud, umbrella, towel, bucket, shovel, sandcastle, shell, starfish, crab, boat, sunglasses, hat, swimsuit, sandals, beach ball, cooler, chair, kite, lifeguard tower, sunscreen, rock.

### 12. Street

car, bus, truck, taxi, ambulance, fire truck, police car, bicycle, motorcycle, helicopter, airplane, traffic light, crosswalk, sidewalk, road, bridge, street lamp, bench, mailbox, fire hydrant, bus stop, house, shop, tree, cloud.

---

## Shared Words

Words in more than one room (number of rooms): chair (5), window (5), clock (4), cloud (4), door (4), tree (4), bench (3), bin (3), book (3), bucket (3), carrot (3), fence (3), flower (3), gate (3), plant (3), rug (3), shovel (3), sun (3), apple (2), backpack (2), ball (2), bicycle (2), blanket (2), bookshelf (2), cup (2), curtain (2), desk (2), egg (2), grass (2), guitar (2), hat (2), kite (2), lamp (2), mirror (2), path (2), piano (2), picture (2), pond (2), pumpkin (2), rock (2), scale (2), shelf (2), sink (2), stool (2), tomato (2), towel (2), wheelbarrow (2).

The lexicon has one entry per word, so a shared word has one label, prompt, accepted spellings, and (from M3) one audio clip.

---

## Notes for Painting and the Lexicon

- **Spelling variants** go in `accepted` (Recall and spell): *pajamas* / *pyjamas*, *faucet* / *tap*, *bin* / *garbage can* / *trash can*, *sofa* / *couch*, *television* / *tv*, *refrigerator* / *fridge*, *shopping cart* / *cart*. The written label follows the voice chosen in M3 (open decision E).
- **Within a room, two words must never share a spelling** (content validation checks this): for example *bath mat* accepts *mat*, so no other bathroom word may accept *mat*.
- **Outdoor rooms** (playground, garden, farm, beach, street) need a variant of the style guide's cutaway room: an isometric outdoor scene on a square of ground, same camera and colours. Add it to the style guide before painting the first one.
- **Animals** (farm, beach) are vocabulary with faces, an exception to the style guide's *no faces on vocabulary objects*: draw them as recognisable real animals in the kawaii style, not as characters.
- **Small things** (spoon, eraser, shell, bell) need a clear spot on a table or the ground; if one stays hard to click after padding, swap it for a larger word.
- **Rooms with fewer words** are fine at first: a room can be published with fewer than 25 words and grow later, as long as the painting already shows them.
