// Cloudinary can resize and compress a picture on the fly: we ask for the size we need.
const isCloudinary = (url) => typeof url === 'string' && url.includes('/upload/');

// The picture, no wider than `width` pixels.
export const fitWidth = (url, width) =>
  isCloudinary(url) ? url.replace('/upload/', `/upload/c_limit,w_${width},q_auto,f_auto/`) : url;

// A square crop around the interesting part, for grids.
export const squareThumb = (url, size) =>
  isCloudinary(url) ? url.replace('/upload/', `/upload/c_fill,g_auto,w_${size},h_${size},q_auto,f_auto/`) : url;
