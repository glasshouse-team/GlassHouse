/**
 * Prepares a walkthrough for World Labs (owner: Temuri, GH-3 / GH-6):
 * H.264, short side 720 (portrait 720x1280), 30 fps, no audio, SDR BT.709 (iPhone HDR is
 * tone-mapped), sized to stay under the 20 MB URL-input limit.
 *
 *   pnpm video:prepare <input.mov> [output.mp4]
 *
 * Then `pnpm worlds generate --video <output.mp4>` uploads it straight to World Labs.
 */
import { statSync } from "node:fs";
import path from "node:path";
import { prepareVideoArgs, probeVideo, runFfmpeg, URL_INPUT_LIMIT_BYTES } from "@/lib/media";

async function main() {
  const [input, outputArg] = process.argv.slice(2);
  if (!input) {
    console.log("Usage: pnpm video:prepare <input.mov> [output.mp4]");
    process.exitCode = 1;
    return;
  }
  const output = outputArg ?? path.join(path.dirname(input), `${path.parse(input).name}-720.mp4`);
  const { durationSec, hdr } = await probeVideo(input);
  console.log(
    `Input ${input}: ${durationSec.toFixed(1)} s${hdr ? `, HDR (${hdr.toUpperCase()}): tone-mapping to SDR BT.709` : ""}`,
  );
  if (durationSec > 150) {
    console.warn(
      "Longer than 150 s: quality will drop to fit 20 MB. Aim for a 60-90 s walkthrough.",
    );
  }
  await runFfmpeg(prepareVideoArgs({ input, output, durationSec, hdr: hdr !== null }));
  const bytes = statSync(output).size;
  const mb = (bytes / 1024 / 1024).toFixed(1);
  console.log(`Wrote ${output} (${mb} MB)`);
  if (bytes > URL_INPUT_LIMIT_BYTES) {
    console.error(
      "Still over 20 MB. Shorten the walkthrough or use World Labs' media-asset upload.",
    );
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
