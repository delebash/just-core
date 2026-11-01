# Action and anything in a movie: research for JustDirect features 12 and 13

The user, 2026-10-31: "we need to be able to do quality action swords cars ect"; "anything someone would wnat to put in a movies is part of the bar".
Method labels: **code** read in the source, **card** from the model's card, **user** a user report, **measured-here** on this PC. Nothing below has been run on action yet.

## 1. The answer so far

1. **Users report LTX-2.3 as great quality, weak motion.** A May 2026 r/StableDiffusion thread: "Great quality, no motion"; the workaround is motion made elsewhere, then a video-to-video pass through LTX ("rendering low-res Wan clips then doing a V2V pass through LTX"). Others: Wan 2.2 depth into LTX, Union Control for pose, fight LoRAs, and cutting around the action. **user**, no settings given. Our 3D guide test is this same pattern, with Blender as the motion source.
2. **Half-size guides are the key engine feature.** Motion Track Control, Union Control and Lightricks' DFR detail pass all use a reference at half the output size (ref0.5). Our guide handles full size only. **code**
3. **Motion Track Control is the best find.** You give a video with coloured spline overlays for the paths things should follow, and the model follows them. For a car's path or a sword's arc this is direct control. Lines can be drawn by hand or tracked from a video, so in the app they could come from the user, the AI or a 3D scene. **card**
4. **DFR is Lightricks' "production quality" path, on our same distilled model.** Half-size stage 1 with extra generated keyframes, then a full-size pass with a detailing IC-LoRA, plus optional temporal rounds to 48 fps, which should help fast motion. Lightricks calls the one-pass pipeline "primarily for educational purposes", though it was what made lips follow audio here. **code, docs**
5. **Cloud leads on fights by the only sources found:** Seedance 2.0 and Kling 3, from a vendor guide that sells access to them, so biased. No head-to-head of fast action exists in what I searched. A gap in the search, not proof.

## 2. Candidates

| # | Method | What it gives action | Weights | sd.cpp needs | State |
|---|---|---|---|---|---|
| 1 | Motion Track Control IC-LoRA (Lightricks) | Exact paths for cars, swords, runners | 312 MB, ungated, community licence, ref0.5, modified 2026-10-22 | Half-size guide | Downloaded for test |
| 2 | Union Control IC-LoRA (Lightricks) | Pose, depth, edges from any motion source, including 3D | ref0.5, in the scene research | Half-size guide | Planned |
| 3 | Our guide + 3DREAL on a moving 3D scene | Exact shapes and paths from Blender or JustStage | On disk | Works today, factor 1 | Gray run proved motion and layout, look not yet |
| 4 | MotionDeblur IC-LoRA (`oumoumad`) | Clears fast-motion smear as a repair pass; heavy blur is "softened rather than fully eliminated" | 1,248 MB, ungated, community licence | Works today if factor 1, not stated on the card | Downloaded for test |
| 5 | DFR pipeline | Better detail, generated keyframes, up to 48 fps | Distilled on disk; detailing IC-LoRA 624 MB, `gated: auto`; temporal upsampler | Half-size guide, keyframe slots, temporal rounds. Large | Read, not planned yet |
| 6 | Motion Enhancer n4w (`rzgar`) | General motion strength; tuned on adult content, "general-purpose" by its card; 3 of 5 usable on full-body input | 2,167 MB, Apache-2.0 | None | Test on action |
| 7 | motion_stabilizer v2 (`vpakarinen`) | Smoother human motion | 643 MB, Apache-2.0; card says 15 to 30 steps, so may not suit distilled 8 steps | None | Lower priority |
| 8 | Wan 2.2 low-res, then LTX V2V | The users' workaround | Wan 2.2 14B needs heavy streaming here; FastWan 5B is in `cli.js` | Guide works today | To test once baselines exist |
| 9 | Go-with-the-Flow noise warping (Netflix, CVPR 2025) | Motion from optical flow, any model | Code and weights on GitHub, per the paper | Noise warp input. Unread | Read next |

## 3. Tests, in order

1. **Baseline, no new code (`queue16.ps1`):** sword duel, car chase, explosion. FLUX.2 klein keyframe, then LTX. Judge shape hold: blade, car body, hands.
2. Half-size guide in sd.cpp, then Motion Track Control on the worst of the three.
3. The motion source test: a fast 3D blockout with coloured props through the guide.
4. MotionDeblur as a repair on the best clip.
5. **Movie shot set:** dialogue close-up, two people talking, crowd, animals, hands at work, dance, water, fire, night exterior, wide landscape, a creature, stylized animation.

## 3.1 Movie shot set, first pass (*measured, 2026-10-31; `queue21.ps1`; viewed by Claude as frame sheets, not judged by the user*)

Each shot: a klein 4B keyframe (11–13 s), then LTX-2.3 distilled one pass, 1280×704 × 97 frames (4 s), `diffusion=disk,te=disk`. **377–389 s a clip, seed 11, every run clean.** Files: `out/movie-<name>.mp4`.

| Shot | How it looks | Weak point |
|---|---|---|
| `twoshot`, two people talking | Natural; faces and hands hold | Lip fit not checked |
| `crowd`, packed market | Very strong: hundreds of people stay coherent | Sign text is fake |
| `horse`, gallop on a beach | Strong: legs, spray, silhouette | The sun moves oddly behind the head |
| `hands`, chef chopping | Very strong: fingers correct, the carrot really slices | None seen in the sheet |
| `dance`, ballet leap | Strong | Slightly stiff |
| `ocean`, ship in a storm | Strong: rigging and lightning hold | The ship barely climbs the wave |
| `fire`, firefighter | Strong | The model cut to a new angle by itself |
| `alley`, rain and neon | Strong | Walks toward camera, not away; the keyframe decided that. Fake signs |
| `vista`, mountains | Beautiful | Almost no camera move, though a flight was asked for |
| `dragon`, over a castle | Beautiful, creature holds | Wrong action: fire from the wrong end, then it leaves frame |
| `anime`, rooftop run | Style holds completely | Stiff: the pose barely changes, then a sudden reframe |
| `scifi`, corridor and robot | Strong: suit, corridor and lights hold | The robot follows behind her instead of stepping out of a door |

**Pattern:** the look is strong across all of it, far ahead of what the keyframe alone would suggest. The weak side is control: exact actions, camera moves, and the model cutting by itself. That matches the users' "great quality, weak motion", and it is what guides and Motion Track address. Lightricks' camera-control LoRAs exist for LTX-2 19B; check for 2.3. Text in a shot is unreliable, so titles and signs need a post step.

## 3.2 The user's review (*2026-10-31, answers in `E:\Dev\Web\test-just-direct\review-answers.json`; this overrides the "viewed by Claude" notes above and in the register*)

Ratings are one clip each, seed 11 unless marked. Notes are the user's own words.

| Clip | Rating | The user's note |
|---|---|---|
| `take-241`, `take-313` | **Film ready**, both | 13 s can't be told from 10 s |
| `movie-twoshot`, `movie-horse` | **Film ready** | |
| `action-car-one` | **Film ready**, but "POLCE" is a deal breaker | The model's own cut: good |
| `movie-crowd`, `movie-scifi`, `depth1-union` | Good | |
| `movie-hands` | Good | "the carrot bended a little when it shouldnt but close" |
| `track-car` | Close, control useful | "it kind slides left instead of turning left" |
| `movie-dance` | Not good enough | "the face either has shodows or is blurry" |
| `movie-ocean` | Not good enough | "half the water is frozen while the one wave htis the ship" |
| `movie-fire` | Not good enough | "his hand never actually touched anything" |
| `movie-alley` | Not good enough | "umbrella is attached to should instead of him holding it" |
| `movie-vista` | Not good enough; no camera move is annoying | "not as realisitc as i would like the mountains look very similiar" |
| `movie-dragon` | Not good enough; wrong action is a deal breaker | |
| `movie-anime` | Not good enough; stiffness is a deal breaker | "three legs" |
| `action-sword-one` | Not good enough | "extra blades like one sticking from the right persons right sword" |
| `action-blast-one` | **Unusable** | "body has three arms after the explosion" |
| `depth-sword` | Not rated | Blades straight: yes. Cut and block: can't tell, "because it is stiff". "i dont know what i am comparing and what control you are talking about": the page failed to explain this section |

Movie set: 2 film ready, 3 good, 7 not good enough.

**Where each fault comes from, checked against the keyframes and frame sheets:**

| Layer | Faults | Evidence |
|---|---|---|
| Keyframe (FLUX.2 klein 4B) | Extra blades; umbrella with no hand; what looks like a third leg | `out/kf-sword.png` gives each fighter two blades despite "one single katana". `out/kf-alley.png` has both hands at his sides. `out/kf-anime.png` has a white sock behind the thigh that belongs to neither leg |
| Video, right after a cut the model made itself | Three arms (`blast`), "POLCE" (`car`) | The fault appears in the new shot, where the keyframe no longer holds anything in place |
| Video, weak motion | The picture holds nearly still for about half the clip, then jumps or cuts (`blast`, `sword`, `fire`, `anime`); frozen water; no camera move; fire from the tail | Frame sheets |

**Attack on my own recipe:** every clip above except the two long takes ran one pass at 1280×704. One pass won for lip movement only; I carried it to action and the movie set with no comparison, though Lightricks calls that pipeline "primarily for educational purposes" (section 1). No `action-*-two` clip exists. The only two-stage clips the user has judged are the long takes, both film ready, in a calm scene with no "no cuts" in the prompt. So two-stage is the first test. It may not help: `horse` and `twoshot` were film ready on one pass, and a calm café proves little about action.

**My earlier words were wrong:** "12 of 12 ran clean" meant the runs finished, and my frame-sheet notes ("strong", "the soldier dives and lands believably") missed faults the user found by watching. Three arms was called strong.

## 3.3 Two-stage against one pass (*measured and viewed by Claude, 2026-10-31, `queue24.ps1`; **not judged by the user yet**; one seed each, so a result for that clip only*)

Same keyframes, prompts and seed 11, 97 frames. Two-stage: 640×352, then the x2 upscaler and 3 refining steps to 1280×704. **329–343 s a clip** against 377–470 s for one pass, peak card 7,253 MiB, 8.8 GB or more RAM free. Files: `out/action-<shot>-two.mp4`, `out/movie-<shot>-two.mp4`.

"Change" is the mean frame-to-frame brightness difference per quarter of the clip, at 320 px wide. It shows where the picture moves. It says nothing about whether a body is right.

| Shot | One pass, change per quarter | Two-stage | What the frames show on two-stage (Claude's view) | Verdict on the frames |
|---|---|---|---|---|
| `blast` | 4.1 5.7 19.4 2.3 | 3.9 5.1 10.9 11.7 | One continuous shot, no cut. He runs, dives and lands. Two arms in all 9 close frames of the dive. Only one leg is visible at the end, the other hidden behind him | Better; the user's eye needed on the leg |
| `car` | 16.0 22.1 21.2 2.0 | 11.8 14.5 20.1 16.1 | No cut; the car turns and drives off. "POLCE" gone in the frames viewed, a badge on the door instead. New fault: the police cars face the camera, driving against the chase | Trade-off: the user rated one pass film ready |
| `fire` | 3.0 5.8 2.5 1.9 | 5.7 11.8 8.5 8.0 | No cut (one pass had a hard cut at frame 37). He reaches out to a door, then walks on with a flashlight. He doesn't kick it. His name tape is garbled | Better |
| `dance` | 1.0 1.2 2.3 1.6 | 0.7 1.7 1.8 1.8 | She really spins and leaps; the body holds. Her face turns away, so the face fault is mostly avoided, not fixed | Better |
| `anime` | 1.2 2.5 7.7 1.2 | 5.3 4.2 4.3 3.1 | She runs away, leaps and lands on the next building: the action asked for. She ends tiny, and the keyframe's stray sock is still there at the start. **Stutter, below** | Better motion, stutter |
| `ocean` | 1.1 1.0 5.3 2.6 | 6.0 5.2 7.0 5.0 | All the water moves from the start, and the ship climbs and crashes. At the end the masts smear as it's swamped. **Stutter, below** | Better motion, stutter |
| `sword` | 0.3 1.3 3.5 2.6 | 0.3 2.0 4.5 3.8 | They fight sooner, no cut. Still two blades each from the keyframe, and blades blur or vanish in the fast frames | Same fault; the keyframe comes first |
| `alley` | 1.6 1.5 1.6 1.6 | 1.1 1.9 2.8 1.6 | Still walks toward the camera. Both hands at his sides with the umbrella floating over him. He leaves the frame | Same fault; the keyframe decides it |
| `vista` | 0.8 0.9 0.9 0.8 | 1.5 1.5 1.3 1.3 | Still no flight, only clouds drifting | Same fault; needs camera control |
| `dragon` | 2.9 4.4 8.9 1.0 | 3.3 6.7 3.6 1.0 | Smoother, but the fire still comes from the tail and misses the castle, and the dragon leaves frame | Same deal breaker |
| `horse` | 1.1 1.1 1.1 1.0 | 3.4 3.8 3.7 4.1 | One pass barely moves: six frames across 1 s are almost the same pose, yet the user rated it film ready. Two-stage has real strides and a moving camera, but slows toward a walk, and the sun shines through his back | The user must choose |
| `hands` | 5.3 6.2 10.2 8.2 | 5.0 4.7 5.7 6.8 | **Worse:** the carrot splits into long halves instead of slices, and the chopping is lost | One pass wins |

**Stutter:** `movie-ocean-two` and `movie-anime-two` come in near-identical pairs of frames, so they move at about 12 fps. Odd steps against even steps: 10.06 to 1.55 and 7.10 to 1.35, a ratio of 6.5 and 5.3. All the others among the 80 mp4 and webm files measured are 1.31 or under, including the other ten two-stage clips. It's already in the raw `.webm`, so it comes from generation, not from our conversion. The cause isn't known. Hand-drawn anime is often animated on every second frame, so the model may be copying that, but that doesn't explain the ocean. Next: re-roll both on another seed, and read the upscaler path if it comes back.

**Hard cuts:** a check of one frame against its neighbours finds one hard cut, `movie-fire` at frame 37. `action-car-one` also cuts by eye, and that check misses it. My rough first figure, "6 of 12 jumped", was wrong: on one pass `blast`, `dragon` and `anime` lurch over several frames, and `ocean`'s spikes are lightning.

**So far, on the frames only:** two-stage is about 12% faster and fixes the "still for half the clip, then jump" fault on the shots that had it. It fixes none of the keyframe faults, nor camera moves or wrong actions, and it lost the chopping. So the app needs both recipes until the user's judgement says otherwise.

## 4. Query log

- "best AI video model for fast action scenes fight scenes 2026" -> vendor lists: Seedance 2.0 and Kling 3 for fights (overchat, a seller), Veo 3.1 general. No head-to-head.
- "how to fix motion blur and warping fast motion AI video generation local LTX Wan" -> the r/StableDiffusion snapshot in section 1; LTX's warble blog (fetch failed, header overflow, unread); hosted Retake.
- "sword fight AI video open source model workflow ComfyUI LTX-2.3 action" -> no sword workflow; a YouTube LTX fight workflow (unread); pose or depth V2V in GGUF workflow collections.
- "car chase AI video local model keep car shape consistent drift Wan 2.2 LTX" -> no shape test exists; Remade-AI car chase LoRA for Wan 2.1.
- "latest techniques controlling fast motion video diffusion pose control depth previs action choreography open weights" -> Go-with-the-Flow, MOFT.
- Hugging Face API, sorted by downloads: "ltx-2 lora", "ltx-2.3 lora", "ltx2 lora", "ltx-2.3", "ltx lora action", "ltx lora fight", "ltx lora motion" -> 130 LTX repos; the names filtered by motion words gave rows 1, 4, 6 and 7, Lightricks' camera LoRAs for LTX-2 19B and slow motion for 2.5.
- Lightricks docs read: `pipeline-selection.md`, `pipelines.md` §12, `multimodal-guidance.md`, `constants.py`, `dfr_pipeline.py` header.

- "LTX 2.3 fight LoRA civitai punches sword action motion lora" -> `Muapi/ltx-2.3-swordbattle` (a listing with no training data or examples, unchecked); `vpakarinen/motion-stabilizer-ltx-23`; **`Lightricks/LTX-2.3-22b-LoRA-Foley-V2A`**, gated, adds sound effects to silent video, worth testing for feature 11; `joyfox/LTX-2.3-Transition-LORA`.
- "LTX 2.3 settings for fast motion action shots steps sampler euler_ancestral res_2s tips reddit" -> no sampler findings. A prompt guide: "fast action" alone is unpredictable, name the concrete motion. A test: tiny moving objects wobble.
- YouTube `Povm432cVtg`, "LTX 2.3 Fight Scene Workflow in ComfyUI": the page gave the title only.

Lightricks' Motion Track example workflow (`LTX-2.3_ICLoRA_Motion_Track_Distilled.json`): a chase scene, one pass at 960×544 × 121, the same 8 distilled sigmas, `euler_ancestral_cfg_pp`, CFG 1, the dev model with the distilled LoRA at 0.5, IC-LoRA at 1. **Note for quality:** that is the dev model at half distilled strength, not our full distilled file.

Not searched yet: Civitai directly (named by a user; blocked to the fetch tools so far), LTX-Director, Reddit directly.
