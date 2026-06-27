#!/usr/bin/env node
// Convert one or more PNG paths into a single multi-resolution .ico.
// Used by build-icon.sh; written in CJS for direct `node scripts/png-to-ico.cjs`.
//
// Usage:
//   node scripts/png-to-ico.cjs <output.ico> <input1.png> [input2.png ...]

const fs = require('fs')
const mod = require('png-to-ico')
// png-to-ico ships as ESM with a `default` export. `imagesToIco` is the
// PNG-bytes-buffers variant; the default takes file paths or buffers.
const pngToIco = mod.default || mod

async function main() {
  const args = process.argv.slice(2)
  const outPath = args.shift()
  const inputs = args
  if (!outPath || inputs.length === 0) {
    console.error('usage: png-to-ico.cjs <out.ico> <in1.png> [in2.png ...]')
    process.exit(2)
  }
  const buf = await pngToIco(inputs)
  fs.writeFileSync(outPath, buf)
  console.log(`wrote ${outPath} (${buf.length} bytes from ${inputs.length} sources)`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
