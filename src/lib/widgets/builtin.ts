import { definition as audioPlayer } from "./audio-player";
import { definition as unitConvert } from "./unit-convert";
import { definition as colorPicker } from "./color";
import { definition as clipboard } from "./clipboard";
import { definition as countdown } from "./countdown";
import { definition as dictionary } from "./dictionary";
import { definition as home } from "./home";
import { definition as screenshot } from "./screenshot";
import { definition as todo } from "./todo";
import type { WidgetDefinition } from "./api/types";

export const builtinWidgets: WidgetDefinition[] = [
    home,
    todo,
    audioPlayer,
    unitConvert,
    colorPicker,
    clipboard,
    dictionary,
    countdown,
    screenshot,
];
