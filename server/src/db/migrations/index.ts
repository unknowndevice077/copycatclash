import * as m001 from './001_init';
import * as m002 from './002_free_for_all';

export interface Migration {
  version: number;
  name: string;
  up: string;
}

/** Ordered list of schema migrations. Append new ones; never edit applied ones. */
export const migrations: Migration[] = [
  { version: 1, name: 'init', up: m001.up },
  { version: 2, name: 'free_for_all', up: m002.up },
];
