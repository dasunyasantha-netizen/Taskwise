// Runs outside Express with a bounded heap and a hard parent-process timeout.
import sharp from 'sharp'
import { createCanvas, DOMMatrix, ImageData, Path2D } from '@napi-rs/canvas'
Object.assign(globalThis, { DOMMatrix, ImageData, Path2D })
process.once('message', async (job: any) => {
  try {
    const source = Buffer.from(job.base64, 'base64'),
      pages: string[] = []
    let pageCount = 1
    if (job.mime === 'application/pdf') {
      const load = new Function('specifier', 'return import(specifier)')
      const pdfjs = await load('pdfjs-dist/legacy/build/pdf.mjs')
      const document = await pdfjs.getDocument({
        data: new Uint8Array(source),
        isEvalSupported: false,
        useSystemFonts: true,
        disableFontFace: true,
      }).promise
      pageCount = document.numPages
      for (let i = 1; i <= Math.min(pageCount, 10); i++) {
        const page = await document.getPage(i),
          unit = page.getViewport({ scale: 1 })
        const scale = Math.min(1.6, 1400 / unit.width, 1800 / unit.height)
        const viewport = page.getViewport({ scale })
        if (
          !Number.isFinite(viewport.width) ||
          viewport.width < 1 ||
          viewport.height < 1
        )
          throw new Error('Invalid page size')
        const canvas = createCanvas(
          Math.ceil(viewport.width),
          Math.ceil(viewport.height)
        )
        await page.render({ canvasContext: canvas.getContext('2d'), viewport })
          .promise
        pages.push(
          (
            await sharp(await canvas.encode('png'))
              .webp({ quality: 65 })
              .toBuffer()
          ).toString('base64')
        )
        page.cleanup()
      }
      await document.destroy()
    } else {
      pages.push(
        (
          await sharp(source, { limitInputPixels: 40000000 })
            .rotate()
            .resize({
              width: 1400,
              height: 1800,
              fit: 'inside',
              withoutEnlargement: true,
            })
            .webp({ quality: 65 })
            .toBuffer()
        ).toString('base64')
      )
    }
    process.send?.({ pages, pageCount })
  } catch {
    process.send?.({
      error:
        'Could not generate a preview. The original is still available; check for a damaged or password-protected document.',
    })
  }
})
