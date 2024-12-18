import { getImage } from 'astro:assets';
import { transformUrl, parseUrl } from 'unpic';

import type { ImageMetadata } from 'astro';
import type { HTMLAttributes } from 'astro/types';

type Layout = 'fixed' | 'constrained' | 'fullWidth' | 'cover' | 'responsive' | 'contained';

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface AttributesProps extends HTMLAttributes<'img'> {}

export interface ImageProps extends Omit<HTMLAttributes<'img'>, 'src'> {
  src?: string | ImageMetadata | null;
  width?: string | number | null;
  height?: string | number | null;
  alt?: string | null;
  loading?: 'eager' | 'lazy' | null;
  decoding?: 'sync' | 'async' | 'auto' | null;
  style?: string;
  srcset?: string | null;
  sizes?: string | null;
  fetchpriority?: 'high' | 'low' | 'auto' | null;
  layout?: Layout;
  widths?: number[] | null;
  aspectRatio?: string | number | null;
}

export type ImagesOptimizer = (
  image: ImageMetadata | string,
  breakpoints: number[],
  width?: number,
  height?: number
) => Promise<Array<{ src: string; width: number }>>;

const ImageSizes = {
  THUMBNAIL: 16,
  EXTRA_SMALL: 32,
  SMALL: 48,
  MEDIUM: 64,
  LARGE: 96,
  EXTRA_LARGE: 128,
  HERO: 256,
  FULL_WIDTH: 384,
};

const DeviceSizes = {
  MOBILE_SMALL: 640, // Older and lower-end phones
  IPHONE_6_8: 750, // iPhone 6-8
  IPHONE_XR_11: 828, // iPhone XR/11
  MOBILE_HORIZONTAL: 960, // Older horizontal phones
  IPHONE_PLUS: 1080, // iPhone 6-8 Plus
  HD_720P: 1280, // 720p
  IPAD_STANDARD: 1668, // Various iPads
  FULL_HD: 1920, // 1080p
  QXGA: 2048, // Quad Extended Graphics Array
  WQXGA: 2560, // Wide Quad Extended Graphics Array
  QHD_PLUS: 3200, // Quad High Definition Plus
  FOUR_K: 3840, // 4K Resolution
  FOUR_POINT_FIVE_K: 4480, // 4.5K Resolution
  FIVE_K: 5120, // 5K Resolution
  SIX_K: 6016, // 6K Resolution
};

const ImageFormats = {
  WEBP: 'image/webp',
};

const config = {
  imageSizes: Object.values(ImageSizes),
  deviceSizes: Object.values(DeviceSizes),
  formats: [ImageFormats.WEBP],
};

const computeHeight = (width: number, aspectRatio: number) => {
  return Math.floor(width / aspectRatio);
};

const parseAspectRatio = (aspectRatio: number | string | null | undefined): number | undefined => {
  if (typeof aspectRatio === 'number') return aspectRatio;

  if (typeof aspectRatio === 'string') {
    const match = aspectRatio.match(/(\d+)\s*[/:]\s*(\d+)/);

    if (match) {
      const [, num, den] = match.map(Number);
      if (den && !isNaN(num)) return num / den;
    } else {
      const numericValue = parseFloat(aspectRatio);
      if (!isNaN(numericValue)) return numericValue;
    }
  }

  return undefined;
};

export const getSizes = (width?: number, layout?: Layout): string | undefined => {
  if (!width || !layout) {
    return undefined;
  }
  switch (layout) {
    case `constrained`:
      return `(min-width: ${width}px) ${width}px, 100vw`;

    case `fixed`:
      return `${width}px`;

    case `fullWidth`:
      return `100vw`;

    default:
      return undefined;
  }
};

const pixelate = (value?: number) => (value || value === 0 ? `${value}px` : undefined);

const getStyle = ({
  width,
  height,
  aspectRatio,
  layout,
  objectFit = 'cover',
  objectPosition = 'center',
  background,
}: {
  width?: number;
  height?: number;
  aspectRatio?: number;
  objectFit?: string;
  objectPosition?: string;
  layout?: string;
  background?: string;
}) => {
  const styleEntries: Array<[prop: string, value: string | undefined]> = [
    ['object-fit', objectFit],
    ['object-position', objectPosition],
  ];

  // If background is a URL, set it to cover the image and not repeat
  if (background?.startsWith('https:') || background?.startsWith('http:') || background?.startsWith('data:')) {
    styleEntries.push(['background-image', `url(${background})`]);
    styleEntries.push(['background-size', 'cover']);
    styleEntries.push(['background-repeat', 'no-repeat']);
  } else {
    styleEntries.push(['background', background]);
  }
  if (layout === 'fixed') {
    styleEntries.push(['width', pixelate(width)]);
    styleEntries.push(['height', pixelate(height)]);
    styleEntries.push(['object-position', 'top left']);
  }
  if (layout === 'constrained') {
    styleEntries.push(['max-width', pixelate(width)]);
    styleEntries.push(['max-height', pixelate(height)]);
    styleEntries.push(['aspect-ratio', aspectRatio ? `${aspectRatio}` : undefined]);
    styleEntries.push(['width', '100%']);
  }
  if (layout === 'fullWidth') {
    styleEntries.push(['width', '100%']);
    styleEntries.push(['aspect-ratio', aspectRatio ? `${aspectRatio}` : undefined]);
    styleEntries.push(['height', pixelate(height)]);
  }
  if (layout === 'responsive') {
    styleEntries.push(['width', '100%']);
    styleEntries.push(['height', 'auto']);
    styleEntries.push(['aspect-ratio', aspectRatio ? `${aspectRatio}` : undefined]);
  }
  if (layout === 'contained') {
    styleEntries.push(['max-width', '100%']);
    styleEntries.push(['max-height', '100%']);
    styleEntries.push(['object-fit', 'contain']);
    styleEntries.push(['aspect-ratio', aspectRatio ? `${aspectRatio}` : undefined]);
  }
  if (layout === 'cover') {
    styleEntries.push(['max-width', '100%']);
    styleEntries.push(['max-height', '100%']);
  }

  const styles = Object.fromEntries(styleEntries.filter(([, value]) => value));

  return Object.entries(styles)
    .map(([key, value]) => `${key}: ${value};`)
    .join(' ');
};

const getBreakpoints = ({
  width,
  breakpoints,
  layout,
}: {
  width?: number;
  breakpoints?: number[];
  layout: Layout;
}): number[] => {
  if (layout === 'fullWidth' || layout === 'cover' || layout === 'responsive' || layout === 'contained') {
    return breakpoints || config.deviceSizes;
  }
  if (!width) {
    return [];
  }
  const DOUBLE_WIDTH_MULTIPLIER = 2;
  const doubleWidth = width * DOUBLE_WIDTH_MULTIPLIER;
  if (layout === 'fixed') {
    return [width, doubleWidth];
  }
  if (layout === 'constrained') {
    return [
      // Always include the image at 1x and 2x the specified width
      width,
      doubleWidth,
      // Filter out any resolutions that are larger than the double-res image
      ...(breakpoints || config.deviceSizes).filter((w) => w < doubleWidth),
    ];
  }

  return [];
};

export const astroAsseetsOptimizer: ImagesOptimizer = async (image, breakpoints, _width, _height) => {
  if (!image) {
    return [];
  }

  return Promise.all(
    breakpoints.map(async (w: number) => {
      const url = (await getImage({ src: image, width: w, inferSize: true })).src;
      return {
        src: url,
        width: w,
      };
    })
  );
};

export const isUnpicCompatible = (image: string) => {
  return typeof parseUrl(image) !== 'undefined';
};

export const unpicOptimizer: ImagesOptimizer = async (image, breakpoints, width, height) => {
  if (!image || typeof image !== 'string') {
    return [];
  }

  const urlParsed = parseUrl(image);
  if (!urlParsed) {
    return [];
  }

  return Promise.all(
    breakpoints.map(async (w: number) => {
      const url =
        transformUrl({
          url: image,
          width: w,
          height: width && height ? computeHeight(w, width / height) : height,
          cdn: urlParsed.cdn,
        }) || image;
      return {
        src: String(url),
        width: w,
      };
    })
  );
};

export async function getImagesOptimized(
  image: ImageMetadata | string,
  { src: _, width, height, sizes, aspectRatio, widths, layout = 'constrained', style = '', ...rest }: ImageProps,
  transform: ImagesOptimizer = () => Promise.resolve([])
): Promise<{ src: string; attributes: AttributesProps }> {
  if (typeof image !== 'string') {
    width ||= Number(image.width) || undefined;
    height ||= typeof width === 'number' ? computeHeight(width, image.width / image.height) : undefined;
  }

  width = (width && Number(width)) || undefined;
  height = (height && Number(height)) || undefined;

  widths ||= config.deviceSizes;
  sizes ||= getSizes(Number(width) || undefined, layout);
  aspectRatio = parseAspectRatio(aspectRatio);

  // Calculate dimensions from aspect ratio
  if (aspectRatio) {
    if (width) {
      if (height) {
        /* empty */
      } else {
        height = width / aspectRatio;
      }
    } else if (height) {
      width = Number(height * aspectRatio);
    } else if (layout !== 'fullWidth') {
      // Fullwidth images have 100% width, so aspectRatio is applicable
      console.error('When aspectRatio is set, either width or height must also be set');
      console.error('Image', image);
    }
  } else if (width && height) {
    aspectRatio = width / height;
  } else if (layout !== 'fullWidth') {
    // Fullwidth images don't need dimensions
    console.error('Either aspectRatio or both width and height must be set');
    console.error('Image', image);
  }

  let breakpoints = getBreakpoints({ width: width, breakpoints: widths, layout: layout });
  breakpoints = [...new Set(breakpoints)].sort((a, b) => a - b);

  const srcset = (await transform(image, breakpoints, Number(width) || undefined, Number(height) || undefined))
    .map(({ src, width }) => `${src} ${width}w`)
    .join(', ');

  return {
    src: typeof image === 'string' ? image : image.src,
    attributes: {
      width: width,
      height: height,
      srcset: srcset || undefined,
      sizes: sizes,
      style: `${getStyle({
        width: width,
        height: height,
        aspectRatio: aspectRatio,
        layout: layout,
      })}${style ?? ''}`,
      ...rest,
    },
  };
}
