'use strict';

export const BASE_SCALE = 1.5;

export const state = {
  project:         null,
  tabs:            [],
  activeIdx:       -1,
  editor:          null,
  bibKeys:         [],
  pdfZoom:         1.0,
  autoTimer:       null,
  suppress:        false,
  pdfDoc:          null,
  pdfPageInfo:     {},
  mainFiles:       JSON.parse(localStorage.getItem('mainFiles')       || '{}'),
  manualMainFiles: JSON.parse(localStorage.getItem('manualMainFiles') || '{}'),
};

export function getMainFile() {
  return state.mainFiles[state.project] || 'main.tex';
}

export function setMainFile(path) {
  state.mainFiles[state.project]       = path;
  state.manualMainFiles[state.project] = true;
  localStorage.setItem('mainFiles',       JSON.stringify(state.mainFiles));
  localStorage.setItem('manualMainFiles', JSON.stringify(state.manualMainFiles));
}

export const $ = id => document.getElementById(id);
