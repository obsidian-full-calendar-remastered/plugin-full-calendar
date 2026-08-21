import { App } from 'obsidian';
import { OFCEvent, PLUGIN_SLUG } from '../../types';
import { getNameBasedLinkedNoteFile } from './linkedNoteResolution';

export type LinkedNoteHoverPayload = {
  event: MouseEvent;
  source: string;
  hoverParent: HTMLElement;
  targetEl: HTMLElement;
  linktext: string;
  sourcePath: string;
};

export function buildLinkedNoteHoverPayload({
  app,
  event,
  locationPath,
  mouseEvent,
  eventEl
}: {
  app: App;
  event: OFCEvent;
  locationPath?: string;
  mouseEvent: MouseEvent;
  eventEl: HTMLElement;
}): LinkedNoteHoverPayload | null {
  const previewPath = getNameBasedLinkedNoteFile(app, event)?.path || locationPath;
  if (!previewPath) return null;

  return {
    event: mouseEvent,
    source: PLUGIN_SLUG,
    // Page Preview tracks this boundary. It must be the individual event so
    // moving directly between calendar events closes A before opening B.
    hoverParent: eventEl,
    targetEl: eventEl,
    linktext: previewPath,
    sourcePath: previewPath
  };
}
