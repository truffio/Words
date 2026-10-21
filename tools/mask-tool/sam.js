/**
 * Segment Anything (SlimSAM) in the browser, via Transformers.js. The model downloads
 * once from Hugging Face and is cached by the browser; everything runs locally.
 *
 * Usage: const sam = await loadSam(onProgress);
 *        const image = await sam.encode(url);       // slow: once per painting
 *        const { masks, scores } = await image.segment([{ x, y, label }]);  // fast
 */
import { AutoProcessor, RawImage, SamModel } from '@huggingface/transformers';

export const SAM_MODEL = 'Xenova/slimsam-77-uniform';

async function loadModel(onProgress) {
  const options = { progress_callback: onProgress };
  const adapter = await navigator.gpu?.requestAdapter().catch(() => null);
  if (adapter) {
    try {
      return {
        model: await SamModel.from_pretrained(SAM_MODEL, { ...options, device: 'webgpu' }),
        device: 'webgpu',
      };
    } catch (error) {
      console.warn('WebGPU unavailable for SAM, falling back to WebAssembly.', error);
    }
  }
  return {
    model: await SamModel.from_pretrained(SAM_MODEL, { ...options, device: 'wasm' }),
    device: 'wasm',
  };
}

/**
 * @param {(progress: object) => void} [onProgress] download progress events
 */
export async function loadSam(onProgress) {
  const [{ model, device }, processor] = await Promise.all([
    loadModel(onProgress),
    AutoProcessor.from_pretrained(SAM_MODEL, { progress_callback: onProgress }),
  ]);

  return {
    device,

    /** Computes the image embeddings of a painting (the slow step). */
    async encode(url) {
      const image = await RawImage.read(url);
      const inputs = await processor(image);
      const embeddings = await model.get_image_embeddings(inputs);
      const { original_sizes: originalSizes, reshaped_input_sizes: reshapedSizes } = inputs;
      const [height, width] = originalSizes[0];

      return {
        width,
        height,

        /**
         * Segments from click points: label 1 = part of the object, 0 = not part of it.
         * @param {{ x: number, y: number, label: 0 | 1 }[]} points in image pixels
         * @returns {Promise<{ masks: Uint8Array[], scores: number[] }>} three candidate
         *   masks (different granularities) with the model's confidence scores
         */
        async segment(points) {
          const inputPoints = processor.reshape_input_points(
            [[points.map((p) => [p.x, p.y])]],
            originalSizes,
            reshapedSizes,
          );
          const inputLabels = processor.image_processor.add_input_labels(
            [[points.map((p) => p.label)]],
            inputPoints,
          );
          const outputs = await model({
            ...embeddings,
            input_points: inputPoints,
            input_labels: inputLabels,
          });
          const [masks] = await processor.post_process_masks(
            outputs.pred_masks,
            originalSizes,
            reshapedSizes,
          );
          const size = width * height;
          const data = masks.data;
          const candidates = [0, 1, 2].map((i) => data.slice(i * size, (i + 1) * size));
          const scores = Array.from(outputs.iou_scores.data);
          return { masks: candidates, scores };
        },
      };
    },
  };
}
