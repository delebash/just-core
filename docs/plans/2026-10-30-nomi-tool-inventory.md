# Nomi desktop app: code-verified tool inventory

Source read: shallow clone of github.com/aqm857886159/Nomi at commit `db6a66ec`, version 0.24.0 (package.json), AGPL-3.0-only. Nothing was run, installed or edited. Every claim comes from reading the UI and Electron code, searching Chinese and English together. Docs were not used as evidence; where a `CLAUDE.md` header or code comment is the only source, the row says so.

## How to read this

**Path shortcuts used in the Evidence column**

| Short | Path |
|---|---|
| `T/` | `src/workbench/timeline/` |
| `P/` | `src/workbench/preview/` |
| `X/` | `src/workbench/export/` |
| `E/` | `electron/export/` |
| `G/` | `src/workbench/generationCanvas/` |
| `N/` | `src/workbench/generationCanvas/nodes/` |
| `D/` | `src/workbench/generationCanvas/nodes/director/` |
| `W/` | `src/workbench/generationCanvas/nodes/whiteboard/` |
| `C/` | `src/workbench/creation/` |
| `S/` | `src/workbench/creation/storyboard/` |
| `A/` | `src/workbench/assets/` |
| `L/` | `src/workbench/library/` |
| `M/` | `electron/shared/modelArchetypes/` |
| `V/` | `electron/shared/videoCapabilities/` |
| `AC/` | `electron/shared/agentCapabilities/` |
| `SH/` | `src/ui/app-shell/shell/` |

**Columns**

- **Depth:** basic, medium or professional, with the reason.
- **By hand:** works with no AI model at all.
- **Service:** `None` = runs on the machine. `Provider` = needs a provider you connect yourself (your own API key or login). `Local download` = no account, but weights download on first use.
- **Status:** `Reachable` = a user can get to it in the UI. `Agent-only` = only the AI agent can call it. `Dead` = code exists but nothing reachable calls it. `Absent` = searched for, not there.

**App facts that apply to every row**

- The top bar has three steps: Creation, Generation, Preview (`src/design/identity.tsx:157-161`). Storyboard is a fourth mode that is not on that bar. You reach it from the document tree (`WorkbenchShell.tsx:60-65`, `C/DocumentListSidebar.tsx:203`, `:487`).
- The left rail has Documents, Catalog, Assets, Flows, then the shared Skills and Prompts (`SH/ShellRail.tsx:35-44`).
- There is no Nomi account or hosted Nomi service in the code. Pricing comments refer to an "official quota" that has not shipped (`G/spend/spendConfirm.ts:220`, `G/quickActions/ImageQuickActionsToolbar.tsx:54`). `model-catalog.json` ships empty.
- All AI runs through one of 20 built-in provider connections or a custom one (`electron/catalog/builtinVendorSeeds.ts:118-139`):
  - Hosted: KIE, APIMart, Agnes, ModelScope, Volcengine (two), RunningHub, Replicate, fal, Runway, MiniMax, ElevenLabs, Meshy, Higgsfield.
  - Local or CLI: ComfyUI; local text (Ollama, LM Studio, LocalAI); Codex local image; Antigravity CLI; Dreamina member CLI; local whisper.cpp.
- About 97 model profiles ship in `electron/catalog/archetypeModes.generated.ts`: 41 image, 37 video, 15 audio, 4 3D. You can add custom vendors and models. This count is curated profiles. I did not verify each profile's parameters one by one.

---

## 1. Story and script

| Tool | What the user can actually do | Depth | By hand | Service | Status | Evidence |
|---|---|---|---|---|---|---|
| Script editor | Rich text: bold, italic, strike, code, highlight, H1-H3, quote, rule, bullet, numbered and task lists, table, link, undo/redo | Basic. General rich text with no screenplay formatting, scene or character elements | Yes | None | Reachable | `C/WorkbenchEditor.tsx:33-39`, `:137-145` |
| Multiple documents | Several documents per project; create, rename, delete; each document holds its own storyboard plans; switcher in the toolbar | Medium. Tree of scripts and plans | Yes | None | Reachable | `C/DocumentListSidebar.tsx:96-115`, `:208`; `SH/ShellRail.tsx:109`, `:232`; `C/WorkbenchEditor.tsx:63` |
| Selection bar | Select text to format it, or send it to AI Edit, a new image node, a new video node, or a storyboard split | Medium. Direct bridge from text to shots | Mixed. Node creation needs no model; generating does | Provider for AI parts | Reachable | `C/SelectionGeneratePopover.tsx:38`, `:173-252` |
| AI rewrite of a selection | Type an instruction; the change appears inline with accept and discard controls | Medium. Reviewable diff | No | Provider (text model) | Reachable | `C/aiRewrite/`; `C/WorkbenchEditor.tsx:147`, `:156-163`, `:225` |
| AI writing modes | 7 built-in system prompts: general, story, screenplay (shot format), assets plan, storyboard text, Seedance prompt, continuity review. Editable, resettable, and you can add your own | Medium. These are prompts, not structured tools. Formats are short-drama focused (15-second episodes) | No | Provider (text model) | Reachable (Agent panel system-prompt section) | `C/creationAiModes.ts:64-189`, `:228-239`; `src/workbench/ai/ProjectAgentResidentShell.tsx:658` |
| Writer skills | 11 bundled writer skills, for example screenwriter, dialogue, structure, adaptation, novel digester, script review | Medium. Method prompts the agent loads | No | Provider (text model) | Reachable | `skills/writer-*/SKILL.md`; `src/workbench/skillLibrary/SkillLibraryPanel.tsx:1-9` |
| Text node on canvas | Free text card. One-click AI processing: expand into a prompt, describe a connected image, translate, split into several items | Medium | Typing yes; processing no | Provider (text model) | Reachable | `N/registry.ts:91-105`; `N/textProcessRun.ts`; `G/runner/textProcessPresets.ts:22-38`; `N/render/TextDocumentNode.tsx:43` |
| Agent writes the script | Agent reads and writes the document; can insert, append or replace | Medium | No | Provider (text model) | Reachable | `AC/verbs/writeVerbs.ts:170`; `AC/verbs/readVerbs.ts:70`; `C/WorkbenchEditor.tsx:178-199` |
| Script file import or export | No document export. Script files can only be attached to the agent chat (.pdf, .doc, .docx, .txt, .md and others) | Basic | Not applicable | None | Export absent; agent attachment reachable | Searched `exportDocument`, `导出文稿`, `导出剧本`, `导出 Word`, `.docx`: only `src/workbench/ai/composer/useComposerAttachments.ts:19` |
| Project templates | 3 seed templates exist in data, but the library page calls `onNewProject()` with no template and nothing else reads the list | Basic | Yes | None | Dead (no picker found) | `L/projectTemplates.ts:15-43`; `L/ProjectLibraryPage.tsx:248`, `:383` |
| Try-now example stories | 3 demo stories in data, no consumer outside the file | Basic | Yes | None | Dead | `L/tryNowExamples.ts:17`; `grep TRY_NOW_EXAMPLES` finds no other file |

Absent from this stage (searched `Fountain`, `FDX`, `Final Draft`, `剧本格式`): no screenplay file format support.

---

## 2. Characters, locations, props, references, reusable saved assets

**Do saved items carry across projects?**

- **No character, location or prop library exists.** Searched `角色库`, `characterLibrary`, `全局角色`: no hits. Anchors live inside one storyboard plan in one project (`electron/shared/storyboard/storyboardPlan.ts:11`, `:35`).
- **Files:** yes, by copy. The Assets panel's all-projects source lists every project's files, and dragging one into another project copies it in (`A/useAllProjectAssets.ts:21`; `A/assetLibraryMaterialize.ts:1-9`).
- **Prompts, skills, workflows:** yes, app-level (`electron/promptLibrary/userPromptStore.ts:2`; `electron/skills/skillStore.ts`; `L/workflowLibrary.ts:5`, `:21`). Workflows sit in browser localStorage, so they stay on that machine and are not in the project folder.
- **Asset folders:** per project (`electron/assets/assetFolders.ts:1-3`).
- **Director assets:** stored inside the Director project (`D/panels/side/AssetsTab.tsx:126`).

| Tool | What the user can actually do | Depth | By hand | Service | Status | Evidence |
|---|---|---|---|---|---|---|
| Storyboard anchors | Shared cards of type character, scene, prop or style, with name, description, static and dynamic features, optional reference, own model. Filter shots by anchor, generate, regenerate, lock | Medium. Real consistency system, per plan only | Yes for editing; generation needs a model | Provider to generate | Reachable | `S/anchorZone/StoryboardAnchorZone.tsx:12-20`; `S/StoryboardPlanEditor.tsx:13-19`, `:162`; `electron/shared/storyboard/storyboardPlan.ts:11-14` |
| Character, Scene, Prop cards on canvas | Image-backed cards with editable name and usage count. They are created by the storyboard, agent or upload; they are not in the Add menu | Basic | Display yes | Provider to generate | Reachable, not directly creatable | `N/render/CharacterCardNode.tsx:30-70`; `G/components/canvasToolbarModel.ts:16-19`; `N/registry.ts:106-137` |
| Look lock (定妆) | Confirm a visual anchor; downstream shots are held until it is confirmed | Medium. Production gate | Yes | None | Reachable on anchor images | `G/fixation/freezeAnchor.ts:21-40`; `G/quickActions/ImageQuickActionsToolbar.tsx:167-178` |
| Catalog tree | Five fixed categories (shots, cast, scene, prop, audio) plus user groups; lists nodes in the project | Basic | Yes | None | Reachable | `src/workbench/project/projectCategories.ts:47-83`; `SH/ShellRail.tsx:98-107`; `src/workbench/sidebar/CategoryTree.tsx` |
| @ references in prompts | Type @ in a prompt to pick a node or asset; a visual chip goes in and the reference is wired to the model's slot | Medium | Yes | None | Reachable | `A/AssetMentionSuggestion.ts`; `A/promptMentions.ts`; `S/shotRow/useShotMentionSource.ts`; `M/types.ts:21-60` |
| Assets panel | Upload image, video, audio or GLB; search; filter by kind and origin; folders; multi-select; delete; preview; drag to canvas or timeline; project or all-projects view | Medium. Solid bin, no metadata tagging | Yes | None | Reachable | `A/AssetLibraryPanel.tsx:93-230`; `A/AssetLibraryToolbar.tsx:17-60`; `electron/shared/contracts/mediaImportPolicy.ts:39` |
| Prompt library | Mine, built-in and public sections; filter image or video; search; put on canvas; write your own prompts with reference images | Medium | Yes (it stores text) | Public sources fetched online; cached with bundled snapshot | Reachable | `src/workbench/promptLibrary/PromptLibraryPanel.tsx:1-8`, `:59-110` |
| Skill library | Browse, search, import by file or drag, export, create with AI, delete with undo; 93 bundled skill folders | Medium. Agent instruction packs | Browse yes; use no | Provider to use | Reachable | `src/workbench/skillLibrary/SkillLibraryPanel.tsx:1-9`; `skills/` |
| Workflow library | Select nodes, save as workflow; search, favourite, edit, delete; copy into another project including its asset files | Medium. Reusable node graphs | Yes | None | Reachable | `G/components/CanvasSelectionToolbar.tsx:64`; `L/WorkflowLibraryContent.tsx:39-63`; `L/workflowLibrary.ts:89-123` |
| Find reference | Search platforms for trending clips, or paste a Douyin or TikTok share link, and land the video in the project | Medium | Yes | Own TikHub key | Reachable (Assets toolbar) | `A/FindReferencePanel.tsx:1-60`; `A/pasteShareLinkImport.ts`; `electron/connectors/tikhubConnector.ts:1-5` |
| Built-in browser capture | Browse the web in the app, bookmark, capture media and prompts into the project | Medium | Yes | None | Reachable (top bar) | `SH/ShellTopBar.tsx:288-291`; `src/ui/browser/dialog/NomiBrowserDialog.tsx`; `electron/browser/media/` |
| Global screenshot capture | Optional hotkey grabs the screen, crop it, land it as a node | Basic | Yes | None | Reachable, off by default | `src/workbench/settings/ScreenshotHotkeySection.tsx:1-10`; `G/components/useCanvasScreenshotCapture.tsx:1-14` |

---

## 3. Moodboard, storyboard, shot planning

Searched `moodboard` and `情绪板`: no tool, only one word in an agent guideline string. The nearest surfaces are the canvas with group frames, the contact sheet, and the whiteboard.

| Tool | What the user can actually do | Depth | By hand | Service | Status | Evidence |
|---|---|---|---|---|---|---|
| Node canvas | Infinite board of image, video, audio, text, clip and 3D cards with wires. Copy, cut, paste, delete, select-all, duplicate as variant, tidy layout, minimap, undo, list view | Professional as a board. Fast, deep interaction | Yes | None | Reachable | `G/reactFlow/GenerationCanvasReactFlow.tsx`; `G/components/useCanvasShortcuts.ts:153-258`; `G/components/NodeContextMenu.tsx:80-111`; `G/components/useTidyCanvas.ts` |
| Add menu | Resident: image, video, audio, text, clip, import file. Under More: Director, 3D model, panorama, whiteboard | Basic | Yes | None | Reachable | `G/components/canvasToolbarModel.ts:53-84` |
| Group frames | Group nodes; rename, describe, colour, collapse, arrange, dissolve, delete; generate all, send to timeline, download all | Medium | Mostly | Provider for generate all | Reachable | `G/components/CanvasGroupToolbar.tsx:26-50`; `G/components/groupGenerate.ts:1-8`; `G/components/groupDownload.ts` |
| Contact sheet | Select 2 or more generated images to build one labelled overview image | Basic | Yes | None | Reachable | `N/buildContactSheetNode.ts:1-52`; `G/components/CanvasSelectionToolbar.tsx:13-16` |
| Whiteboard tools | Select, brush (size 4-96), eraser, text (size 8-160). 6 swatches plus colour picker. `shape` exists in the type but has no button | Basic. A sketch pad, not a paint program | Yes | None | Reachable | `W/WhiteboardEditingToolbar.tsx:92-101`, `:125-126`; `W/lib/canvas.ts:8`, `:55` |
| Whiteboard canvas | 5 ratios or custom size 64-4096 px; import images; drag in images from any canvas node; draw over an opened image | Medium | Yes | None | Reachable | `W/WhiteboardEditingToolbar.tsx:127-129`; `W/lib/canvas.ts:43-52`; `W/WhiteboardDrawingTool.tsx:247-269`, `:338-396`; `W/InlineWhiteboard.tsx:384-390` |
| Whiteboard layers | List only: select, hide, delete; group multiple objects. Each stroke is a layer. **No reorder, no opacity control, no lock control, no blend modes.** The `opacity` and `locked` fields exist but have no control | Basic | Yes | None | Reachable | `W/WhiteboardDrawingTool.tsx:232-238`, `:570-582`; `W/WhiteboardLibraryPanel.tsx:170-196` |
| Whiteboard object edits | Move, scale (ratio locked), flip H/V, group, delete. Rotate and skew are switched off | Basic | Yes | None | Reachable | `W/WhiteboardEditingToolbar.tsx:108-115`; `W/whiteboardSceneRender.ts:275-283`, `:144`; `W/WhiteboardLeaferCanvas.tsx:329-333` |
| Whiteboard AI action | Background removal on an imported image layer | Medium | Yes (local model) | Local download (about 50 MB) | Reachable | `W/WhiteboardDrawingTool.tsx:479-525` |
| Whiteboard output | Done saves a PNG as a new version of the node and keeps editable state; camera button makes a separate screenshot node; usable as a reference for generation | Medium | Yes | None | Reachable | `W/InlineWhiteboard.tsx:145-204`, `:241-321`; `W/whiteboardCanvasExport.ts:36-63`; `N/registry.ts:274-289` |
| Storyboard editor | Table of shots: prompt, duration, kind (image, video, image+video), model, mode, parameters, aspect override, references. Insert, copy, delete, drag reorder, multi-select, move to scene, keyboard navigation | Professional for AI shot lists. Not a drawing storyboard | Yes for planning; generation needs models | Provider to generate | Reachable from document tree | `S/StoryboardPlanEditor.tsx:129-200`; `S/shotRow/StoryboardShotRow.tsx:58-122`; `S/StoryboardShotTable.tsx` |
| Storyboard bulk bar | Apply kind, model, parameters and film-wide default aspect to all shots; warns when a model ignores aspect | Medium | Yes | None | Reachable | `S/StoryboardBulkBar.tsx:50-157` |
| Scene grouping | Group shots into scenes with totals and per-scene playback | Medium | Yes | None | Reachable | `S/StoryboardShotTable.tsx:549-552`; `src/i18n/locales/storyboardEditor.ts` (`sceneGroup`, `playback`) |
| Shot run controls | Generate a row, regenerate, 3 more variants, lock a shot, skip for this batch, batch generate remaining, re-run with fresh references, free recovery of an already-paid result | Professional. Real production control | No | Provider | Reachable | `S/exec/storyboardRowActions.ts`; `S/StoryboardPlanEditor.tsx:34-44`, `:172-177`; `S/shotRow/StoryboardVariantsDrawer.tsx` |
| Sequential playback | Play generated shots in order, per plan or scene, skipping ungenerated ones | Medium | Yes | None | Reachable | `S/StoryboardPlanEditor.tsx:51`, `:167-168`, `:284` |
| Execution plan review | Shows required merges, optional merges and splits against each model's duration limits; adopt one at a time | Medium. Automated, free | Yes (no AI, rule engine) | None | Reachable | `S/StoryboardPlanStrategyPanel.tsx:14-29`, `:84-90`; `V/planResolver.ts` |
| Script to shots | Split a script or selection into a storyboard plan | Medium | No | Provider (text model) | Reachable | `G/agent/runStoryboardPlanner.ts:33`; `C/WorkbenchEditor.tsx:221`; `AC/verbs/writeVerbs.ts:189` |
| Shot table from a video | On a video: reads each shot and transcribes dialogue into a table with keyframe, time, shot size, motion, visual, dialogue, on-screen text, mood. Add, rename, hide columns; edit cells; 3 row heights; retry a shot | Professional for breaking down reference films | No (needs vision model); dialogue can use local whisper | Provider; quote confirm on long runs; local whisper about 575 MB per code comment | Reachable (video toolbar) | `N/shotTable/ShotTableNode.tsx:34-110`, `:94-95`; `N/shotTable/ShotTableToolbar.tsx`; `N/shotTable/ShotTableGrid.tsx`; `N/NodeVideoFrameToolbar.tsx:96-103`; `src/i18n/locales/shotTable.ts` |
| Generation list view | Same nodes as cards with a large detail pane and generate-all per section | Medium | Yes | Provider to generate | Reachable (canvas or list switch) | `src/workbench/generation/list/GenerationListView.tsx:1-6`; `src/workbench/WorkbenchShell.tsx:365` |

---

## 4. 3D staging: scene, posing, camera, lighting, animation

The Director is its own full editor that opens over the generation page from a Director node (`N/registry.ts:256-273`). It has two faces: Director view with a read-only shot strip, and Refine with the full tools (`D/DirectorViewShell.tsx`, `D/DirectorRefineShell.tsx`). It is the deepest hand tool in the app. Rendering uses three.js. Everything below works by hand, offline, with no model, unless the row says otherwise.

| Tool | What the user can actually do | Depth | By hand | Service | Status | Evidence |
|---|---|---|---|---|---|---|
| Scene layers | Several scenes in one project; outliner with search and object tree; scene settings; import a scene JSON as a new layer | Medium | Yes | None | Reachable | `D/panels/topbar/SceneMenu.tsx:1-10`; `D/panels/side/AssetsTab.tsx:173-183` |
| Characters | Place female or male mannequin; name, colour, transform. No face, hair or clothing editing | Medium. Good blocking dummies, not characters | Yes | None | Reachable | `D/panels/topbar/AddObjectMenu.tsx:160-178`; `D/panels/inspector/CharacterInspector.tsx:50-64` |
| Crowd | Grid of characters: rows, columns, spacing 0.5-5 m, shared action; change the whole group's action later | Medium | Yes | None | Reachable | `D/panels/topbar/AddObjectMenu.tsx:179-194`; `D/panels/inspector/PrimitiveInspector.tsx:17-43` |
| Pose presets | 44 entries: T-pose plus 43 UAL actions (idle, dialogue, walk, run, sit, combat and more) | Medium. Fixed library, no import of new animation found | Yes | None | Reachable | `D/model/actionLibrary.ts:1-12`, `:49-50`; `D/panels/inspector/PoseTab.tsx:57-61` |
| Body types | 8 scale presets: standard, child, teen, fat, thin, stocky, tall, giant | Basic. Scaling only | Yes | None | Reachable | `D/model/rigs.ts:123-131`; `D/panels/inspector/PoseTab.tsx:64-71` |
| IK posing | Drag 7 IK targets plus 4 pole targets in 3D or on a 2D puppet; snap feet to floor; mirror pose; reset limb or all | Professional for a staging tool | Yes | None | Reachable | `D/panels/inspector/SkeletonTab.tsx:122-145`; `D/panels/inspector/PuppetFigure.tsx` (per inspector header) |
| FK posing | Pick any of 17 joints; 3-axis sliders ±180°; quick −90/−45/0/45/90; reset joint | Professional for a staging tool | Yes | None | Reachable | `D/panels/inspector/SkeletonTab.tsx:146-191` |
| Primitives | 8 shapes (cube, sphere, plane, cylinder, cone, torus, tetrahedron, icosahedron); draw a box in the view; colour, roughness, metalness, opacity, wireframe, flat shading, helper flag | Medium. Greybox set dressing | Yes | None | Reachable | `D/model/directorTypes.ts:23-25`; `D/panels/inspector/PrimitiveInspector.tsx:58-68`; `D/panels/topbar/AddObjectMenu.tsx:147` |
| Import 3D and splats | Upload .glb, .gltf, .fbx, .ply, .spz, .splat, .ksplat, .sog, .json, or images; folders, rename, move, search. Uploaded models get name and transform only, no posing or material edit | Medium. Gaussian splat scenes are a strong point | Yes | None | Reachable | `D/model/assetKinds.ts:10`, `:16`; `D/panels/side/AssetsTab.tsx:50-58`, `:165-234`; `D/panels/inspector/PrimitiveInspector.tsx:51-52` |
| Transform tools | Select, move, rotate, scale gizmos with keys 1-3; numeric sliders; group and ungroup; grid snap; WASD fly and F to focus | Professional | Yes | None | Reachable | `D/panels/viewport/ViewportToolbar.tsx:19-27`; `D/model/hotkeys.ts:21-37`; `D/panels/inspector/SceneLayerInspector.tsx:38`; `D/scene/ViewCamera.tsx:276` |
| Cameras | Add from current view or 13 presets relative to the subject (front, side, back, high, low, bird's-eye, over-the-shoulder and others) | Professional | Yes | None | Reachable | `D/model/cameraPresets.ts:13-50`; `D/panels/topbar/AddObjectMenu.tsx:57-76`, `:206-218` |
| Lens | 8 lens presets 16-200 mm, focal slider 12-300 mm, FOV read-out. No aperture or depth-of-field control found | Medium | Yes | None | Reachable | `D/panels/inspector/CameraInspector.tsx:30-63`; `D/model/cameraLens.ts:12-13`, `:80-88` |
| Camera POV | View through a camera, picture-in-picture preview, rule-of-thirds and aspect guides | Medium | Yes | None | Reachable | `D/panels/viewport/CameraPovHud.tsx:46-77`; `D/panels/viewport/PipViewport.tsx`; `D/panels/topbar/ViewMenu.tsx:104` |
| Record camera move | Fly the camera through the shot and record; it simplifies to keyframes | Professional. Virtual-camera style | Yes | None | Reachable (key R) | `D/useCameraMotionRecorder.ts` (per D/CLAUDE.md); `D/panels/viewport/CameraPovHud.tsx:66-70`; `D/model/recordingSimplify.ts` |
| Phone virtual camera | Pair a phone by QR on the LAN; motion drives the camera; preview goes to the phone; pan and lift speed settings | Professional idea; not run | Yes | None (LAN) | Reachable | `D/panels/dialogs/MobileConnectDialog.tsx:1-10`; `D/useMobileCamera.ts`; `electron/director/mobileBridgeServer.ts` |
| Paths | Draw a path freehand or point by point for a character or camera; edit waypoints (frame, position, angles); aim at a target; batch-edit several waypoints | Professional | Yes | None | Reachable | `D/panels/context/ContextCard.tsx:37-50`; `D/model/hotkeys.ts:25-26`; `D/panels/inspector/WaypointCard.tsx`; `D/panels/inspector/BatchWaypointsCard.tsx` (per inspector header) |
| Close-up rig | Clip that follows a target: anchor (eye, face, chest and others), azimuth, facing mode, distance 0.3-20, height, camera motion preset; convert to path | Professional. Unusual and useful | Yes | None | Reachable | `D/panels/inspector/CloseupClipInspector.tsx:1-10`, `:32-37` |
| Look-at clips | Character gaze clip: target, body part, offsets, ease, limit angle, strength | Medium | Yes | None | Reachable | `D/panels/inspector/LookAtClipInspector.tsx` (per inspector header) |
| Lights | Directional, point, spot. On/off, visible, lock, colour, 7 temperature presets, intensity, spot angle and softness, distance, decay, shadows, position, yaw, pitch, 4 quick angles | Medium to professional. Real controls, three-style lighting only | Yes | None | Reachable | `D/panels/inspector/LightInspector.tsx:32-68`; `D/model/lights.ts:19-34`; `D/panels/topbar/AddObjectMenu.tsx:32` |
| Environment | Sky colour, ground and grid, 720 panorama as sky with radius and rotation, global transform; display modes solid, translucent, clay. No HDRI, weather or time of day found | Medium | Yes | None | Reachable | `D/panels/inspector/SceneLayerInspector.tsx:29-60`; `D/panels/topbar/ViewMenu.tsx:27`, `:77-83` |
| Animation timeline | Up to 60 s at 30 fps. Tracks per character, object or camera; sub-tracks for path, action, bone keyframes, look-at, close-up. Move and trim clips, split, Q and W cut, copy and paste, pin and fold tracks, bypass a sub-track, frame stepping, playback speed 0.25-2× | Professional for its size. **Much deeper than the main video timeline** | Yes | None | Reachable | `D/model/timelineTracks.ts:14-17`; `D/timeline/TimelineHeader.tsx:30`, `:66-105`; `D/model/hotkeys.ts:44-53`; `D/timeline/CLAUDE.md` (module map) |
| Keyframing | Insert keyframe (I), Auto Key mode, bone keyframes inside action clips | Professional | Yes | None | Reachable | `D/timeline/TimelineHeader.tsx:77`, `:91-105`; `D/panels/inspector/SkeletonTab.tsx:41-53`; `D/model/clipKeyframes.ts` |
| Output | Screenshot PNG; record MP4 with 9 aspect options (8 ratios plus free) at 1080, 1440 or 4K, 30 fps, up to 60 s, H.264 CRF 20, muted. Send output to canvas as image or video node | Medium to professional | Yes | None | Reachable | `D/model/directorTypes.ts:17-19`; `D/model/exportSize.ts:11-27`; `D/panels/topbar/ProduceButton.tsx:78-90`; `D/panels/outputs/OutputsPopover.tsx:48-94`; `electron/video/framesToVideoArgs.ts:29-37` |
| Produce (出成片) | Renders a grey preview (max 10 s), attaches it to a video node as reference, fills the prompt. **It does not spend**: you press generate on that node | Medium | Preview yes; final no | Provider for the final shot | Reachable | `D/agent/directorProduce.ts:6-10`, `:46-60`; `D/panels/topbar/ProduceButton.tsx:51-59`; `D/model/directorPreviewState.ts:30` |
| AI staging | Agent builds a 3D-BOX plan into a Director project with blocking and cameras, then a grey preview | Medium to professional | No | Provider (text model) | Agent-only | `AC/verbs/writeVerbs.ts:380-400`; `D/model/compiler/directorPlanCompiler.ts`; `D/agent/applyDirectorWrite.ts` |
| AI camera move and staging image | Agent tools make a reference image or short camera-move video (13 move types per module map). Manual video-node camera control was removed | Medium | No | Provider (text model) | Agent-only | `AC/canvasWrite.ts:271`, `:286`; `D/agent/CLAUDE.md`; `D/agent/cameraMoveVocab.ts` |

---

## 5. Image generation and image editing

The Whiteboard is listed in stage 3. Use it here too for drawing over an image.

| Tool | What the user can actually do | Depth | By hand | Service | Status | Evidence |
|---|---|---|---|---|---|---|
| Image node generate | Prompt plus model, mode (text or edit), quantity, per-model parameters, references by wire or @; 41 model profiles (Seedream, Nano Banana, GPT Image, Flux, Imagen, Qwen, Runway, Higgsfield and others) | Professional breadth; depth depends on the model | No | Provider, or local ComfyUI, Codex or Antigravity | Reachable | `N/registry.ts:138-153`; `N/NodeGenerationComposer.tsx:309`, `:368`, `:376`, `:442`; `electron/catalog/archetypeModes.generated.ts`; `N/controls/ModeBar.tsx`; `N/controls/QuantitySelect.tsx` |
| Prompt helpers | Effect picker, translate, AI optimise with word-level diff before applying | Medium | No | Provider (text model) | Reachable | `N/NodeGenerationComposer.tsx:311`; `N/NodeEffectChips.tsx:16-40`; `N/NodePromptTranslator.tsx`; `N/NodePromptOptimizer.tsx:1-6` |
| Multi-angle 9-grid | One click makes a new linked node with a template and the same model. Does not spend until you generate. Result can be split into 9 | Medium. Prompt template, quality depends on model | No | Provider (image-edit model) | Reachable | `G/quickActions/quickActionCatalog.ts:68-69`; `G/quickActions/ImageQuickActionsToolbar.tsx:51-52`, `:189-204`; `skills/effect-multi-angle-grid/SKILL.md` |
| Next and previous moment | Template derives a frame just after or before this one | Medium. Prompt template | No | Provider | Reachable | `G/quickActions/quickActionCatalog.ts:70-71` |
| Three-view, story 4-panel | Template character turnaround; 4-panel story grid | Medium. Prompt template | No | Provider | Reachable | `G/quickActions/quickActionCatalog.ts:72-73` |
| Upscale (高清) | Sends to an upscale model: Topaz, Recraft Crisp or Dreamina. If none is connected, the menu points to setup | Medium | No | Provider | Reachable | `G/quickActions/quickActionCatalog.ts:74`; `M/imageUpscale.ts:1-20`; `M/dreaminaUpscale.ts` |
| Outpaint (扩图) | Template-driven expansion via an edit model. **No mask or frame control** | Basic to medium. Prompt template | No | Provider | Reachable | `G/quickActions/quickActionCatalog.ts:75`; `skills/effect-fill-outpaint/` |
| Inpaint | **Not available.** The composer has no mask control; `mask_url` is treated as headless and is stripped or rejected | Absent | Not applicable | Not applicable | Absent | `M/gptImage2.ts:39-41`. Searched `inpaint`, `局部重绘`, `蒙版`, `涂抹`, `mask` |
| Relight, background change, angle change as tools | No dedicated tool. Only via a free prompt on an edit model, or the 9-grid for angles | Absent as tools | Not applicable | Not applicable | Absent | Searched `relight`, `重打光`, `补光`, `换背景`: only 3D scene light code |
| Background removal | One click; result becomes a new version with transparency. Runs on the machine | Medium. Automatic only, no refine brush | Yes (local model, no prompt) | Local download (about 50 MB) | Reachable | `N/useNodeImageEditing.ts:443-520`; `src/lib/removeBackground.ts`; `G/quickActions/ImageQuickActionsToolbar.tsx:205-214`; package `@imgly/background-removal` |
| Crop | Drag a crop frame, confirm; saved as a new version. No ratio presets found | Basic | Yes | None | Reachable | `N/useNodeImageEditing.ts:282-366`; `N/render/ImageCropGridActionBar.tsx`; `G/quickActions/ImageQuickActionsToolbar.tsx:158` |
| Grid split | Split into 4, 9, 16, 25 or a custom grid, with adjustable grid lines; pieces become grouped asset nodes | Medium. Very useful with grid-style generations | Yes | None | Reachable | `N/GridSplitPicker.tsx:9`, `:24-28`; `N/useNodeImageEditing.ts:165-277`; `N/render/cropGridGeometry.ts` |
| Rotate and flip | 90° left, 90° right, flip horizontal, flip vertical. Saved as a new version. No free rotation | Basic | Yes | None | Reachable | `N/useNodeImageEditing.ts:54-75`, `:381-441`; `G/quickActions/ImageQuickActionsToolbar.tsx:143-148` |
| Colour or tone adjust on images | None found | Absent | Not applicable | Not applicable | Absent | Searched `亮度`, `对比度`, `饱和度`, `brightness`, `contrast`, `saturation` in image toolbar and whiteboard |
| Duplicate as variant | New card with the same setup, to try another version | Basic | Yes | None | Reachable | `N/NodeFloatingToolbar.tsx:301-313` |
| Version stack | Every result on a node is kept; choose the primary; compare; delete | Medium. Core of the workflow | Yes | None | Reachable | `N/versionCards/NodeVersionCards.tsx`; `N/versionCards/nodeVersionEntries.ts`; `G/model/nodeResultLifecycle.ts` |
| Effects in prompt library | Bundled image effects such as expression grid, six-view object, overhead view, scene three-view, natural texture, restore drawing, transfer expression, plus curated product and restore prompts | Medium. Prompts | No | Provider | Reachable | `skills/effect-*`; `skills/curated-*`; `N/NodeEffectChips.tsx:15` |
| Panorama node | Upload an equirectangular image, view it, frame a shot and capture it as a new image node, use it as Director sky. **Cannot generate** (no generation kind) | Medium | Yes | None | Reachable | `N/registry.ts:242-255`; `N/PanoramaViewer.tsx:117-164`; `N/render/PanoramaNodeToolbar.tsx`; `N/useNodePanoramaHandlers.ts` |
| Layer decomposition | Provider seed remains, but its main-process path was deleted with the entry | Absent | Not applicable | Not applicable | Dead | `electron/catalog/replicate.ts:10`, `:20-21` |
| Asset preview and download | Fullscreen preview; download the original | Basic | Yes | None | Reachable | `G/quickActions/ImageQuickActionsToolbar.tsx:234-247`; `N/useResultDownload.ts` |

---

## 6. Video generation

| Tool | What the user can actually do | Depth | By hand | Service | Status | Evidence |
|---|---|---|---|---|---|---|
| Video node generate | 37 model profiles (Seedance, Veo, Kling, Wan, MiniMax, Hailuo, Runway, Grok, HappyHorse, Vidu, Higgsfield and others). Parameters per model such as duration, resolution, aspect | Professional breadth | No | Provider, or local ComfyUI | Reachable | `N/registry.ts:169-183`; `electron/catalog/archetypeModes.generated.ts`; `V/registry.ts` |
| Generation modes | Text; first frame; first and last frame; reference; omni multimodal (images, video, audio references where the model allows). The UI shows only what the selected model declares | Professional | No | Provider | Reachable | `G/quickActions/nodeTryRecipes.ts:43-49`, `:91-110`; `N/controls/generationModePresentation.ts`; `M/types.ts:77` |
| Reference slots with limits | Per-mode image, video and audio slots with limits and dependencies between slots | Professional | No | Provider | Reachable | `M/types.ts:21-60`; `N/controls/referenceList.ts`; `N/controls/referenceDependency.ts` |
| Video-to-video edit | Available on models that declare it, such as HappyHorse edit | Medium, model dependent | No | Provider | Reachable when such a model is connected | `V/happyhorse.ts:93-95` |
| Multi-frame | Dreamina multiframe mode | Medium | No | Dreamina member CLI login | Reachable when connected | `V/dreaminaMultiframe.ts`; `electron/catalog/dreaminaVendor.ts:1-13` |
| Camera effects | 30 bundled camera prompt templates (`effect-camera-01` to `30`). Prompt text, not a camera control | Medium | No | Provider | Reachable | `skills/effect-camera-*/SKILL.md`; `N/NodeGenerationComposer.tsx:311-312` |
| Motion reference from depth | Turn a clip into a depth video locally and use it as a motion reference. Excludes fingers, faces and cloth detail, as the UI states | Medium | Yes for extraction | Local download (about 50 MB); needs WebGPU | Reachable | `G/videoDepth/NodeDepthActionButton.tsx:1-40`; `electron/shared/canvas/videoDepthModels.ts:1-8`; `src/i18n/locales/videoDepth.ts` |
| Director preview as reference | 3D preview attached to a shot as reference video, or written into the prompt if the model has no slot | Medium to professional | Preview yes | Provider for final | Reachable | `D/agent/directorProduce.ts:33-41` |
| Batch generate | Group generate-all with per-item ticks; storyboard batch with dependency waves | Professional | No | Provider | Reachable | `G/components/groupGenerate.ts:1-8`; `G/runner/dependencyWaves`; `S/exec/storyboardRowActions.ts` |
| Spend confirm | Confirmation before paid generation, with a plan summary | Medium | Not applicable | Provider | Reachable | `G/spend/SpendConfirmDialog.tsx`; `G/spend/spendConfirm.ts` |
| Task centre | Queue view; cancel, retry; free re-fetch of a stuck result; export jobs and production runs listed | Medium | Yes | None | Reachable (top bar) | `src/workbench/taskCenter/TaskCenterPanel.tsx:1-35`; `G/runner/recoverTaskActions` |
| Technical auto-check | After generation: flags black frames, silent audio, zero duration, undecodable files. Only a badge, it never blocks | Basic | Yes | None | Reachable | `electron/review/technicalCheck.ts:1-20`; `N/TechnicalReviewBadge.tsx:1-20` |
| Shot AI verification | Scores identity, composition, continuity 1-5 and raises a deviation card | Medium | No | Provider | Agent or storyboard flow; I did not trace every entry point | `G/agent/shotVerify.ts:1-40`; `src/workbench/ai/resident/useShotVerifyFeedback.tsx`; `G/components/ReconcileDeviationCard.tsx` |
| ComfyUI workflows | Connect one or more local ComfyUI backends, import workflow JSON, expose fields, check missing nodes and models, template library. Includes video-in video-out workflows | Professional. The main route to anything Nomi lacks | No (it is your model) | Local ComfyUI, no account | Reachable (Settings, Models) | `electron/comfyuiIpc.ts:1-40`; `src/ui/onboarding/ComfyuiLocalCard.tsx`; `src/ui/onboarding/ComfyuiTemplateLibrary.tsx`; `src/i18n/locales/comfyuiWorkflowPage.ts`; `electron/catalog/comfyuiWorkflowImport.ts:407` |
| Custom vendor | Add any provider with a custom call contract, optionally assisted by AI | Professional | Not applicable | Your own | Reachable | `src/ui/onboarding/CustomVendorCard.tsx`; `src/ui/onboarding/CustomCallEditor.tsx`; `AC/verbs/onboardingVerbs.ts:18-155` |
| Keyframe node | **An image card, not animation keyframing.** Used as first or last frame | Basic | Display yes | Provider | Reachable by agent or storyboard; not in Add menu | `N/registry.ts:154-168`; `G/components/canvasToolbarModel.ts:16-19` |

---

## 7. Audio: voice, music, sound effects

Audio has no canvas import. Audio files go through the Assets panel; generated audio lives on an Audio node (`A/importAudioToLibrary.ts:1-6`; `G/components/canvasAddIntentActions.tsx:71`).

| Tool | What the user can actually do | Depth | By hand | Service | Status | Evidence |
|---|---|---|---|---|---|---|
| Audio node | Generate, or play back with seek; shows kind (voice, BGM, SFX). **The "waveform" is 20 fixed bars, not the real waveform** | Basic | Playback yes | Provider to generate | Reachable | `N/registry.ts:184-200`; `N/render/AudioStripNode.tsx:68-105`, `:118-122` |
| Voice (TTS) | Models: ElevenLabs v3 and Multilingual, MiniMax Speech 2.8, Seed TTS, Doubao TTS, Runway Seed Audio, Nomi audio. Voice, speed, pitch, volume, language vary by model; MiniMax voice is a typed voice ID | Medium | No | Provider | Reachable | `M/audioArchetype.ts:11-32`; `M/minimaxSpeech28.ts:23-32`; `M/elevenAudio.ts:35`, `:175`; `M/seedTtsArchetype.ts`; `M/doubaoTtsArchetype.ts` |
| Voice cloning | One slot: Runway Seed Audio speech takes a single clone reference clip | Basic to medium | No | Runway | Reachable when connected | `M/runwaySeedAudio.ts:60-71` |
| Music | Suno v5.5, ElevenLabs Music, MiniMax Music 3, Lyria 3.5. Suno also extends or covers an uploaded track | Medium | No | Provider | Reachable | `M/sunoAudio.ts:38-71`; `M/elevenAudio.ts:66`; `M/minimaxMusic3.ts:21`; `M/lyria35.ts:23` |
| Sound effects | ElevenLabs SFX, Suno SFX, Runway Seed Audio; some support looping | Medium | No | Provider | Reachable | `M/elevenAudio.ts:100`; `M/sunoAudio.ts:111`; `M/runwaySeedAudio.ts:51` |
| Transcription, cloud | Whisper-1 with language pick, ElevenLabs Scribe with speakers | Medium | No | Provider | Reachable | `M/audioArchetype.ts:33-35`; `M/elevenAudio.ts:127` |
| Transcription, local | Offline whisper.cpp with auto language and VAD | Medium to professional | Yes (local model, no prompt) | Local download | Reachable | `M/localSpeech.ts:1-50`; `electron/localSpeech/localSpeechInstall.ts:1-20`; `electron/shared/localSpeech/localSpeechAssets.ts:1-14` |
| SRT from transcript | Button copies SRT text **to the clipboard**. No file save and no route onto the timeline | Basic | Yes | None | Reachable | `N/render/AudioStripNode.tsx:47-65`, `:189`; `src/i18n/locales/generationCommon.ts:1109` |
| Lip sync | **Not supported.** The in-app handbook says so directly | Absent | Not applicable | Not applicable | Absent | `src/workbench/onboarding/handbookContent.ts:76-78`. Searched `lip sync`, `口型` |
| Timeline audio | See stage 9 | | | | | |

---

## 8. 3D generation

| Tool | What the user can actually do | Depth | By hand | Service | Status | Evidence |
|---|---|---|---|---|---|---|
| 3D Model node | Text or image to GLB: Hunyuan3D v3.1, HiTem3D v21, Meshy 6, Meshy 7. Parameters include face count, PBR, topology, resolution | Medium | No | Provider (RunningHub, Meshy) | Reachable (Add menu, More) | `N/registry.ts:290-307`; `M/hunyuan3d.ts:8-50`; `M/hitem3d.ts:1-16`; `M/meshy7.ts:7-35`; `M/meshy6.ts` |
| 3D viewer | Orbit with auto-rotate and three-point light in the card. GLB only | Basic | Yes | None | Reachable | `N/model3d/Model3DViewer.tsx:1-17`, `:93-97` |
| Use in Director | **No direct link.** A 3D Model node has no output wire (`output: false`). To use it, download the GLB and upload it into the Director | Basic | Yes | None | Reachable with a manual step | `electron/shared/canvas/edgeAdmission.ts:34`; `D/panels/side/AssetsTab.tsx:202-234` |
| Retopology, rigging, texture editing | None found | Absent | Not applicable | Not applicable | Absent | Searched `rigging`, `retopo`, `绑定骨骼`, `拓扑` beyond the model parameter |

---

## 9. Picture editing on a timeline

**Model in one line:** one timeline per project, 30 fps, and exactly three fixed media tracks (image, video, audio) plus one text lane. There is no add-track function, and clips on a track cannot overlap (`T/timelineTypes.ts:93-97`; `T/timelineMath.ts:143-168` (line 148 builds only the three); `T/kernel/timelineKernel.ts:297-303`; `src/workbench/project/workbenchProjectSession.ts:16`). The export manifest's own warning says so directly: effect and keyframe entities "are not first-class timeline tracks yet" (`X/renderManifest.ts:24-28`). Everything here is by hand with no AI unless stated.

| Tool | What the user can actually do | Depth | By hand | Service | Status | Evidence |
|---|---|---|---|---|---|---|
| Tracks | One image track, one video track, one audio track, one text lane. Video draws over image, so a two-layer composite is possible. No add, delete, reorder or lock track | Basic | Yes | None | Reachable | `T/TimelinePanel.tsx:570-586`; `P/TimelinePreview.tsx:398-456`; `E/ffmpegFiltergraph.ts:387-393` |
| Add to timeline | Drag from canvas or Assets; click a shot in the source panel; toolbar button on a node. Default appends; hold Alt to place at the cursor. Wrong type is refused | Medium | Yes | None | Reachable | `T/TimelineTrack.tsx:86-91`, `:122-182`; `P/PreviewSourcePanel.tsx:104-113`; `N/NodeFloatingToolbar.tsx:211-240` |
| AI arrange (AI 拼片) | Lays storyboard shots out in shot order with captions. **Despite the name no AI runs:** it is a sort by shot number | Medium | Yes | None | Reachable | `T/TimelinePanel.tsx:124-144`, `:393`; `G/agent/storyboardTimelinePlan.ts:6-19`; `src/workbench/adoption/adoptStoryboardBatch.ts:199-205` |
| Cut (split) | Split at the playhead: key S, scissors button, right-click | Basic | Yes | None | Reachable | `T/timelineEdit.ts:344-399`; `T/TimelinePanel.tsx:387`; `T/timelineShortcuts.ts:62` |
| Scissor mode | Click-to-cut mode exists, but nothing turns it on; only Esc turns it off | Absent in practice | Yes | None | Dead | `T/TimelinePanel.tsx:204`; `T/TimelineClip.tsx:345-352`; `src/workbench/workbenchStore.ts:455`. No `setTimelineSplitMode(true)` in src |
| Trim | Drag clip edges with a live Δframes and duration bubble; snapping; Shift disables snap. Stops at neighbours and at source length; image clips stretch freely | Medium. No ripple trim | Yes | None | Reachable | `T/TimelineClip.tsx:85-137`; `T/timelineEdit.ts:449-499` |
| Move | Drag with slide into the nearest gap on collision; multi-select with Shift or Ctrl; group drag. No overwrite, no insert edit, no cross-track move | Basic to medium | Yes | None | Reachable | `T/TimelineClip.tsx:139-251`, `:361-365`; `T/timelineEdit.ts:101-118`, `:306-326` |
| Nudge | Shift+< and Shift+> move a clip one frame | Basic | Yes | None | Reachable | `T/timelineShortcuts.ts:64-66`; `T/timelineEdit.ts:426-436` |
| Duplicate | Ctrl+D places a copy after the clip. On a text clip, the menu's Duplicate creates a new default-text clip of the same style; it does **not** copy the text | Basic | Yes | None | Reachable | `T/timelineEdit.ts:401-424`; `T/TimelineContextMenu.tsx:90-93` |
| Ripple delete | Shift+Backspace. Closes the gap **on that track only**; other tracks and text do not move, so A/V can drift | Basic | Yes | None | Reachable | `T/TimelineContextMenu.tsx:83`; `T/timelineShortcuts.ts:59`; `T/kernel/timelineKernel.ts:393-428` |
| Delete left and right (Q, W) | Removes whole clips fully left or right of the playhead on that track and ripples. It does not trim the clip under the playhead | Basic | Yes | None | Reachable | `T/TimelineContextMenu.tsx:84-85`; `T/TimelinePanel.tsx:218-227`; `T/timelineShortcuts.ts:55-56` |
| Slip, slide, roll, ripple trim, three-point edit | **None by hand.** Kernel has `ripple` and `source-window`, but only the agent's edit plan reaches them | Absent by hand | Not applicable | Provider for agent | Agent-only | `T/kernel/timelineKernel.ts:35-47`, `:507-559`; `AC/verbs/writeVerbs.ts:415-425`; `T/agent/timelinePlanSummary.ts:62` |
| Snap and zoom | Toggle snap (N); zoom with −, =, 0, Ctrl+wheel, buttons; ruler in m:ss | Basic. No frame timecode on the ruler | Yes | None | Reachable | `T/TimelinePanel.tsx:38-43`, `:398-402`, `:460-465`; `T/timelineShortcuts.ts:42-46`; `T/snapping/` |
| Undo and redo | 30 steps. Framing changes are **not** in the undo stack | Basic | Yes | None | Reachable | `src/workbench/workbenchStore.ts:69`; `T/timelineClipWritesSlice.ts:13-17` |
| Shortcuts panel | `?` opens a list | Basic | Yes | None | Reachable | `T/TimelineShortcutsDialog.tsx`; `T/TimelinePanel.tsx:298-314` |
| Regenerate from timeline | Right-click a clip to regenerate its source node; the result flows back | Medium, unusual | No | Provider | Reachable | `T/TimelineContextMenu.tsx:75`; `T/TimelinePanel.tsx:335-339` |
| Transitions | 5 names in the picker: cut, dissolve, fade, match cut, whip pan. **Only dissolve and fade render.** Match cut and whip pan stay hard cuts, and the picker warns. Same track, touching clips only; audio track none. Duration in frames; apply to all seams | Basic. No wipes or library. In export, the outgoing clip holds on its last frame during the dissolve | Yes | None | Reachable | `T/TimelineTransitionPicker.tsx:10`, `:38`, `:65`; `T/timelineTransition.ts:41-45`, `:117-141`; `E/ffmpegFiltergraph.ts:242-244`, `:573-578`; `P/inspector/ClipTransitionFields.tsx:70-74`; `T/TimelineContextMenu.tsx:118-127` |
| Titles and captions | Caption or title-card preset. Edit on the preview, drag to place, centre guides, resize, duration by dragging, align to shot. Adding and moving keep text clips apart, so normally one text shows at a time | Basic to medium | Yes | None | Reachable | `P/TimelinePreview.tsx:221-247`, `:469-563`; `T/TimelineTextTrack.tsx`; `T/timelineTextEdit.ts:24-44`; `T/TimelineContextMenu.tsx:96-110`; `P/OverlaySelectionBox.tsx` |
| Text styling | Size and 5 system font stacks. **No text colour, no bold or italic, no alignment, no outline, no animation.** Dark text on a fixed pale card, always | Basic | Yes | None | Reachable | `P/inspector/TextClipFields.tsx:21-83`; `T/textFonts.ts:10-16`; `T/textLayout.ts:25-30`; `T/textOverlayCanvas.ts:45-58` |
| Auto captions | On AI arrange, storyboard text becomes caption clips. **No transcript-to-captions path** | Basic | Yes | None | Reachable | `src/workbench/adoption/adoptStoryboardBatch.ts:199-205` |
| Framing | Per clip: fit or fill, scale slider 50-300%, drag to pan on the preview, reset. Output matches the preview | Basic. Static only | Yes | None | Reachable | `P/inspector/PreviewInspector.tsx:102`; `T/clipFraming.ts:9-57`; `P/TimelinePreview.tsx:297-326` |
| Keyframes | **None on the video timeline.** Searched `keyframe`, `关键帧` in `T/`, `E/` | Absent | Not applicable | Not applicable | Absent | `X/renderManifest.ts:24-28` |
| Effects | **None.** Searched `滤镜`, `effect`, `filter` | Absent | Not applicable | Not applicable | Absent | `X/renderManifest.ts:24-28`; `E/exportPlanner.ts:31` names an effect route, but no such renderer dependency exists |
| Colour | **None.** Searched `调色`, `LUT`, `色温`, `饱和度`, `对比度`, `hue`, `eq=`, `curves` in `T/`, `E/`, `P/`, `src/i18n/locales/timelineEditor.ts` | Absent | Not applicable | Not applicable | Absent | No hits |
| Speed | **None.** Searched `倍速`, `变速`, `setpts` for speed, `atempo`, `倒放`, `定格`. The speed selector in the app is the Director's playback rate only | Absent | Not applicable | Not applicable | Absent | No hits; `E/ffmpegFiltergraph.ts:419` uses `setpts` only to place clips; `D/timeline/TimelineHeader.tsx:30` |
| Masks, chroma key, blend, opacity, rotation | **None.** `rotation` on text is reserved and has no handle | Absent | Not applicable | Not applicable | Absent | Searched `蒙版`, `chroma`, `抠像`, `绿幕`, `blend`, `opacity` in `T/`; `T/timelineTypes.ts:74` |
| Clip audio | Per clip: gain −60 to 0 dB (slider and number), mute, fade in, fade out in seconds. **No boost above 0 dB.** Applies to audio clips and to a video clip's own sound | Basic to medium | Yes | None | Reachable | `P/inspector/PreviewInspector.tsx:104`; `T/clipAudio.ts:3-4`, `:51-61`; `E/ffmpegFiltergraph.ts:34-55` |
| Track audio | Track mute button; music volume slider applies to all clips on the audio track | Basic | Yes | None | Reachable | `T/TimelineTrack.tsx:229-240`; `P/inspector/PreviewInspector.tsx:97` |
| Audio mixing | One standalone audio lane plus each video clip's sound, summed at export. **Two audio clips cannot overlap,** so music plus separate dialogue needs one of them baked into the video. No waveform on clips, no EQ, compression, ducking, or loudness tools | Basic | Yes | None | Reachable | `E/ffmpegFiltergraph.ts:312-375`; `T/kernel/timelineKernel.ts:297-303`; `T/TimelineClip.tsx:256-281`. Searched `响度`, `压缩器`, `均衡器`, `ducking` |
| Preview player | Play, frame step, time read-out, volume, mute, fullscreen, add text. Master volume is preview only | Basic | Yes | None | Reachable | `P/PreviewControlBar.tsx:84-113`; `P/TimelinePreview.tsx:148-157` |
| Aspect ratio | 7 ratios: 16:9, 9:16, 1:1, 4:5, 3:4, 4:3, 21:9 | Medium | Yes | None | Reachable | `P/previewAspectRatios.ts:12-20`; `P/inspector/PreviewInspector.tsx:95` |
| Editing layout | Resizable and collapsible source, inspector, timeline and agent panels with presets | Basic | Yes | None | Reachable | `P/PreviewWorkspace.tsx:191-258`; `P/EditingLayoutMenu.tsx` |
| Canvas Clip node | A small timeline on a node for images and video with drag order, split, duplicate, delete, nudge. Exports whole cut or each segment, to canvas or file. **Fixed at 16:9, 1080p, standard** | Basic | Yes | None | Reachable | `N/registry.ts:201-215`; `N/ClipNode.tsx:404-470`; `N/ClipNodeActionToolbar.tsx`; `N/clipNodeExport.ts:26-44` |
| Agent timeline edit | Agent applies an atomic plan of move, remove, split, trim, source-window, ripple, transition, text, audio; the user sees a preview and can undo | Medium to professional | No | Provider (text model) | Reachable | `AC/verbs/writeVerbs.ts:415-432`, `:439`; `T/kernel/timelineKernel.ts:10-90`; `T/agent/TimelinePlanPreviewLayer.tsx` |

---

## 10. Finishing and post: VFX, cleanup, upscaling, captions, frame extraction

There is no finishing or VFX stage. Searches below were in `src/`, `electron/shared/`, `electron/catalog/` and `skills/`, in both languages.

| Tool | What the user can actually do | Depth | By hand | Service | Status | Evidence |
|---|---|---|---|---|---|---|
| Frame extraction | Capture first, last or current frame to a linked image node, for first or last frame use | Medium | Yes | None | Reachable | `N/NodeVideoFrameToolbar.tsx:64-74`; `N/NodeVideoControls.tsx:49`; `N/extractVideoFrameToNode.ts`; `electron/video/extractVideoFrame.ts` |
| Video trim on the node | Filmstrip trim, frame-accurate, re-encoded at CRF 18, kept at source resolution, saved as a new node | Medium | Yes | None | Reachable | `N/NodeVideoClipPanel.tsx`; `N/trimVideoToNode.ts`; `electron/video/trimVideoArgs.ts:1-29` |
| Scene-cut detection | Detect cuts with a sensitivity slider, preview, tick the ones you want, land them as image nodes | Medium to professional. No AI, uses ffmpeg | Yes | None | Reachable | `N/NodeShotCutPanel.tsx:1-50`; `electron/video/detectShotCuts.ts:1-16`; `N/NodeVideoFrameToolbar.tsx:95` |
| Depth pass | See stage 6 | | | | | |
| Image upscale | See stage 5 | | | | | |
| Video upscale | **No built-in tool.** Only via a ComfyUI workflow, or MiniMax H3 Regeneration, which takes only H3 768P tasks to 2K | Absent as a tool | No | Local ComfyUI or APIMart | Indirect | `V/minimaxH3Regeneration.ts:8`; `electron/catalog/comfyuiWorkflowImport.ts:407`; `electron/catalog/runwayOfficial.ts:689`, `:715` (Runway upscale noted, not profiled) |
| Video background removal | Only via ComfyUI | Absent as a tool | No | Local ComfyUI | Indirect | `electron/catalog/comfyuiWorkflowImport.ts:407` |
| Object removal, cleanup | **None.** Searched `object remove`, `消除`, `擦除` | Absent | Not applicable | Not applicable | Absent | Hits were unrelated code comments |
| Interpolation, denoise, stabilisation | **None as tools.** Searched `补帧`, `插帧`, `降噪`, `防抖` | Absent | Not applicable | Not applicable | Absent, ComfyUI only | Hits refer to ComfyUI corpus or unrelated code |
| Face swap, try-on | **None as tools.** Searched `换脸`, `换装`, `try-on` | Absent | Not applicable | Not applicable | Absent | Hits were prompts or unrelated |
| Captions | Timeline text only (stage 9); SRT to clipboard (stage 7). Burned in at export; no subtitle file output | Basic | Yes | None | Reachable | `X/textOverlayPng.ts`; `E/ffmpegTextOverlayGraph.ts:29-30` |
| Prompt-based restoration | `effect-restore-drawing`, `curated-restore-image` | Basic | No | Provider | Reachable | `skills/effect-restore-drawing/`; `skills/curated-restore-image/` |
| Playback repair | Videos that fail to decode (for example HEVC) are transcoded automatically | Medium | Yes | None | Reachable, automatic | `src/media/useVideoPlaybackHeal.ts`; `P/TimelinePreview.tsx:98-101` |

---

## 11. Export and delivery: formats, resolutions

| Tool | What the user can actually do | Depth | By hand | Service | Status | Evidence |
|---|---|---|---|---|---|---|
| Export MP4 | One button in the top bar on the Preview page. Output goes to `<project>/exports` with a timestamped name; the folder opens | Basic | Yes | None | Reachable | `SH/ShellTopBar.tsx:258-276`; `P/TimelinePreview.tsx:249-276`; `E/exportPaths.ts:4-11`, `:38-58` |
| Format and codec | **MP4 only, H.264 (libx264, preset medium), yuv420p, AAC 192 kbps when any source has audio.** No codec, container or bitrate choice | Basic | Yes | None | Reachable | `E/exportTypes.ts:15-27`; `E/ffmpegCommandBuilder.ts:58-60`, `:93-103`; `E/exportJobs.ts:132-139` |
| Resolution | **720p or 1080p only.** Other ratios scale from a 720 or 1080 short side, for example 1080x1920, 2520x1080. A `source` value exists in the type but is excluded | Basic | Yes | None | Reachable | `P/inspector/PreviewInspector.tsx:96`; `X/renderManifest.ts:9-12`, `:34-43`, `:157`; `E/exportTypes.ts:2` |
| Quality | Small, standard, high = CRF 28, 23, 18 | Basic | Yes | None | Reachable | `P/inspector/PreviewInspector.tsx:96`; `E/ffmpegCommandBuilder.ts:14-18` |
| Frame rate | Timeline fps, 30 by default, no UI to change it | Basic | Yes | None | Fixed | `T/timelineMath.ts:16`, `:24-28`; grep `setTimelineFps` empty |
| Render engine | Local ffmpeg filter graph from source files. If an asset is not local, it falls back to recording a WebM from a canvas and transcoding. If encoding fails after that, a WebM file downloads | Medium | Yes | None | Automatic | `X/exportApi.ts:100-123`, `:146-152`; `E/exportJobs.ts:99-104`; `E/ffmpegFiltergraph.ts`; `X/timelineWebmExport.ts` |
| Letterbox colour | **White, not black,** to match the preview. Not user adjustable | Basic | Yes | None | Fixed | `E/ffmpegFiltergraph.ts:384-385`; `X/timelineWebmExport.ts:59-60` |
| Job control | Export jobs appear in Task Centre and can be cancelled | Basic | Yes | None | Reachable | `src/workbench/taskCenter/exportJobTaskCenter.ts`; `E/exportJobManager.ts` |
| Agent export | Agent starts, inspects, cancels export (720p or 1080p, the same 7 ratios) | Medium | No | Provider (text model) | Reachable | `AC/verbs/writeVerbs.ts:469`, `:484`; `AC/exportCapabilities.ts:15-17` |
| Single asset download | Download any node's original result; group download | Basic | Yes | None | Reachable | `N/useResultDownload.ts`; `G/components/groupDownload.ts` |
| Director output | Separate path up to 4K, muted. See stage 4 | Medium | Yes | None | Reachable | `D/model/exportSize.ts:14` |
| Other formats | **None:** no ProRes, HEVC, AV1, GIF, image sequence, audio-only, subtitle file. **No NLE interchange** (EDL, FCPXML, AAF, OTIO, Premiere, DaVinci). No storyboard or script PDF | Absent | Not applicable | Not applicable | Absent | Searched each term; `fcpxml|.edl|OTIO|premiere` found nothing; HEVC hits are playback only; `.pdf` hit is agent attachment only |

---

## 12. Project management: library, saving, undo, history

| Tool | What the user can actually do | Depth | By hand | Service | Status | Evidence |
|---|---|---|---|---|---|---|
| Project library | Grid of projects; new, open, rename, delete with a choice; open a folder as a project; source filter; search; skills and prompts tabs | Medium | Yes | None | Reachable | `L/ProjectLibraryPage.tsx:44-47`, `:248-254`, `:378-383`; `L/projectDeleteFlow.ts` |
| Project menu | Recent projects, back to library, new, rename | Basic | Yes | None | Reachable | `SH/ShellTopBar.tsx:88-102` |
| Project storage | Real folders on disk; default location in Settings; exports and `.nomi` data inside. Cross-device use via a synced folder, with status badge | Medium | Yes | None | Reachable | `src/workbench/settings/ProjectLocationSection.tsx:25-45`; `src/workbench/settings/SettingsDialog.tsx:45`; `L/ProjectSyncBadge.tsx`; `E/exportPaths.ts:4-11` |
| Autosave | Saves 700 ms after changes. No manual save needed. Director saves after an idle gap (2 s per module map). Whiteboard drafts save after 250 ms | Medium | Yes | None | Automatic | `src/workbench/project/workbenchProjectSession.ts:192`, `:309-312`; `D/directorEditorPersistence.ts`; `W/InlineWhiteboard.tsx:120-125` |
| Crash recovery | One backup revision per project; hydration recovery on open | Basic | Yes | None | Automatic | `src/workbench/project/projectBackup.ts:10`; `src/workbench/project/projectHydrationRecovery.ts` |
| Undo by surface | Canvas 80 steps; timeline 30; whiteboard 50 snapshots; document in the editor; Director has its own; storyboard delete has undo. **Each surface has a separate stack, and whiteboard history goes when it closes** | Medium | Yes | None | Reachable | `G/events/canvasUndoJournal.ts:25`; `src/workbench/workbenchStore.ts:69`; `W/WhiteboardDrawingTool.tsx:138`; `S/storyboardDeleteUndo.ts`; `D/model/hotkeys.ts:38-39` |
| Generation history | Versions on each node (stage 5); provenance panel shows prompt and parameters of a result | Medium | Yes | None | Reachable | `N/ProvenancePanel.tsx:14-23`; `N/NodeFloatingToolbar.tsx:289-299` |
| Lock | Lock a node so a batch does not re-run it; lock a storyboard shot | Medium | Yes | None | Reachable | `N/NodeLockBadge.tsx`; `S/exec/storyboardRowActions.ts` (`toggleNodeLock`) |
| Settings | Files, Models, AI policy, Automation, General, About; language zh-CN or en; theme; canvas gestures; default generation models; vendor order; diagnostics bundle | Medium | Yes | None | Reachable | `src/workbench/settings/SettingsDialog.tsx:54-64` |
| Project import or export as a package, duplicate project | **None found** beyond opening a folder | Absent | Not applicable | Not applicable | Absent | Searched `importProject`, `exportProject`, `duplicate` in `L/ProjectLibraryPage.tsx`: no hits |
| Versioned project history, snapshots, collaboration, comments, review links | **None found** | Absent | Not applicable | Not applicable | Absent | Searched `snapshot`, `协作`, `评论` in project and library folders; only single backup above |

---

## Notes

### (a) Libraries behind the main tools

| Area | Library | Evidence |
|---|---|---|
| Node canvas | `@xyflow/react` 12.11.5 | `package.json`; `N/NodeFloatingToolbar.tsx:10` |
| Whiteboard | `leafer-ui`, `@leafer-in/editor`, `@leafer-in/export`, `perfect-freehand` | `package.json`; `W/whiteboardCanvasTypes.ts:21` |
| 3D, Director | `three` 0.184, `@react-three/fiber`, `@react-three/drei`, `@sparkjsdev/spark` 2.1 for Gaussian splats | `package.json`; `D/CLAUDE.md`; `N/model3d/Model3DViewer.tsx:4` |
| Panorama | `@photo-sphere-viewer/core` | `N/PanoramaViewer.tsx:17` |
| Script editor | `@tiptap/*` | `C/WorkbenchEditor.tsx:5` |
| Video encode and analysis | `@ffmpeg-installer/ffmpeg`, `@ffprobe-installer/ffprobe`, called as a child process; libx264, AAC; filter graphs written by hand. WebM fallback uses the browser's media recording | `package.json`; `E/ffmpegCommandBuilder.ts`; `E/ffmpegRunner.ts`; `X/timelineWebmExport.ts` |
| Background removal | `@imgly/background-removal` on `onnxruntime-web` | `package.json`; `src/lib/removeBackground.ts` |
| Depth | Depth Anything V2 Small on WebGPU; weights about 50 MB on demand | `electron/shared/canvas/videoDepthModels.ts:1-8`; `G/videoDepth/videoDepth.worker.ts` |
| Local speech | whisper.cpp sidecar, downloaded on first use with sha256 checks | `electron/localSpeech/localSpeechInstall.ts:1-20`; `M/localSpeech.ts:33` |
| Agent | `@earendil-works/pi-agent-core`, `pi-ai`, `pi-coding-agent`, `@mastra/core`, `@anthropic-ai/sandbox-runtime`, `@modelcontextprotocol/*` | `package.json`; `electron/agentLane/` |
| UI | React 19, Mantine 8, Radix, Tailwind 3, Zustand, i18next, `react-resizable-panels` | `package.json` |

### (b) AI steps the agent can do by itself

All of this needs a connected text model. The tool list is one registry: `AC/verbs/*`, about 20 core verbs plus model-setup verbs.

- **Reads:** `look_at_canvas`, `read_script`, `read_timeline`, `look_at_media`, `list_models`, `check_job`, `read_skill` (`AC/verbs/readVerbs.ts:59-193`).
- **Writes without spending:**
  - `write_script` for the document.
  - `draft_shots` to create or update image, video, audio or 3D drafts, and storyboard plans with anchors.
  - `arrange_canvas` for tidying and wiring.
  - `write_node_text`.
  - `make_artifact`: SVG, HTML, Markdown or table cards made without a generation model.
  - `stage_shot` to build a Director 3D plan and grey preview.
  - `edit_timeline` for an atomic edit plan, with `undo`.
  - `delete_from_canvas`.
  - `export_video`, `cancel_job`, `save_skill`.

  (`AC/verbs/writeVerbs.ts:170-516`)
- **Generate:** `generate` asks for approval and returns what you decided (`AC/verbs/writeVerbs.ts:285-300`). It cannot silently spend by default.
- **Approval modes:** `request` (default) asks before every paid generation. `direct` skips that, with brakes such as repeated shot failure or going beyond the agreed plan. Irreversible actions always ask (`AC/capabilityApprovalPolicy.ts:46-56`).
- **Work modes:** ask, edit selection, or agent (`AC/capabilityApprovalPolicy.ts:17-27`).
- **Model setup:** connect a provider, set a key, declare models, try a model, remove a provider (`AC/verbs/onboardingVerbs.ts:18-155`). `try_model` is the only verb declared as spend (`:137`).
- **External agents over MCP:** Claude Code, Claude Desktop, Codex, Cursor and WorkBuddy can drive Nomi with `nomi_*` tools (`electron/shared/mcpClientRegistry.ts:15-20`; `electron/capabilityCore/mcpToolCatalog.ts`).
- **Production Run:** a long multi-step run started by `nomi_run_start` over MCP, with gates and artifacts. **The UI cannot start one.** It only shows and controls runs in Task Centre (`src/workbench/production/ProductionRunTaskCard.tsx:12-20`; `AC/productionRun.ts:12-60`; grep `startProductionRun` in `src/` is empty).
- **Limits I confirmed:** the agent has the same media tools as the user, so it also has no inpaint, colour, speed or keyframes on the timeline.

### (c) What surprised me

**Bigger than the name suggests**
1. **The Director is a real previs tool.** IK and FK posing, path drawing, close-up rigs, recording a camera by flying it, a phone virtual camera, splat scenes, and a 60-second multi-track keyframe timeline. Its timeline is far deeper than the video editor's.
2. **Shot Table** is a serious reference-film breakdown, not a table.
3. **Scene-cut detection** is free, local, and has a sensitivity slider with preview.
4. **The Storyboard page** is the app's production core: per-shot model and mode, anchors, locks, batches, duration rules, free recovery of paid results. It is also the one mode missing from the top bar.
5. **ComfyUI import** is a full sub-system and the only route to many post tools.

**Smaller than the name suggests**
6. **The timeline is a sequence assembler.** 3 fixed tracks, 1 text lane, no keyframes, effects, colour, speed or masks.
7. **Transitions:** 5 listed, 2 work. Match cut and whip pan render as hard cuts, with an in-picker warning.
8. **"AI arrange"** uses no AI. It is a sort by shot number.
9. **Text has no colour control** and always sits on a pale card.
10. **Whiteboard** has no shapes, no layer order, no opacity, no rotation. The `shape` tool exists only as a type.
11. **Outpaint and the "effects"** are prompt templates, not image tools. Inpaint does not exist, and the code strips `mask_url` on purpose.
12. **"Keyframe" node** is an image card.
13. **Panorama node** cannot generate.
14. **The audio "waveform"** is 20 identical bars.
15. **Export** stops at 1080p H.264 MP4 from the main timeline, while the Director's silent 3D render goes to 4K. The canvas Clip node is locked to 16:9, 1080p, standard.
16. **Letterbox bars are white.**
17. **Q and W** delete whole clips rather than trim to the playhead, as other editors do.
18. **Ripple delete** moves only that one track, so sound or captions can drift out of sync.
19. **Text clip "Duplicate"** makes a blank default clip rather than a copy.
20. **Dissolve** freezes the outgoing frame in export.

**Dead or disconnected**
21. Scissor mode, layer decomposition, try-now stories and project templates exist in code with no way to reach them.
22. A generated 3D model cannot be wired to the Director; it needs a download and re-upload.
23. There is no reusable character library across projects. Only raw files, prompts, skills and workflows cross over.
24. SRT goes only to the clipboard, with no route to the timeline.

### What I could not confirm

- Nothing was run, so all of this is what the code says, not observed behaviour.
- Quality of any model, and whether each provider's account path works today, including the handbook's claim of free Agnes access.
- Per-model parameters: I read a sample of profiles, not all 97.
- Director rows marked "per inspector header" or "per D/CLAUDE.md": I confirmed the file exists and read the module header, but did not read the whole component. These are `PuppetFigure`, `LookAtClipInspector`, `WaypointCard`, `BatchWaypointsCard`, `useCameraMotionRecorder`.
- Shot AI verification: I did not trace every entry point.
- Canvas `ClipNode` drag behaviour: I read its action toolbar and export code, not the full 709-line component.
- Whether uploaded rigged models can play actions in the Director. The inspector offers none, but I did not trace the render path.
