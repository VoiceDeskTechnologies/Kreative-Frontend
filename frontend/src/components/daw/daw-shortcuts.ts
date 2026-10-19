export const DAW_SHORTCUTS = [
  { key: "Space", action: "Play / pause" },
  { key: "R", action: "Record to selected track" },
  { key: "S", action: "Split selected clip at playhead" },
  { key: "Ctrl/Cmd+B", action: "Cut the highlighted range and preserve its gap" },
  { key: "Ctrl/Cmd+Z", action: "Undo the last studio change" },
  { key: "Ctrl/Cmd+Y", action: "Redo the last studio change" },
  { key: "Ctrl/Cmd+Shift+Z", action: "Redo the last studio change" },
  { key: "Ctrl/Cmd+Shift+P", action: "Toggle the right-side panel" },
  { key: "Ctrl/Cmd+Shift+M", action: "Toggle the detached mixer" },
  { key: "Home", action: "Go to start" },
  { key: "Escape", action: "Close the topmost open panel or dialog" },
] as const;
