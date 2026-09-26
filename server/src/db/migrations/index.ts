import * as m001 from './001_init';

export interface Migration {
  version: number;
  name: string;
  up: string;
}

/** Ordered list of schema migrations. Append new ones; never edit applied ones. */
export const migrations: Migration[] = [{ version: 1, name: 'init', up: m001.up }];
