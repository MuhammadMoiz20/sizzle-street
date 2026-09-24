import type { MinigameKind } from '../game/types';
import type { MinigameFactory } from './types';
import { chop } from './chop';
import { grill } from './grill';
import { fry } from './fry';
import { stir } from './stir';
import { season } from './season';

export const MINIGAMES: Record<MinigameKind, MinigameFactory> = { chop, grill, fry, stir, season };
