#!/usr/bin/env bun
import { push } from "./index.ts";

process.exitCode = await push();
