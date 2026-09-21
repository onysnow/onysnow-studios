import React from 'react';

interface ResponsiveImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  srcSetAvif?: string;
  srcSetWebp?: string;
  placeholder?: string;
}

/**
 * A robust responsive image component for Vite 7+ and vite-imagetools.
 * Usage:
 * import myImageAvif from './image.jpg?w=300;600;900&format=avif&as=metadata&srcset';
 * import myImageWebp from './image.jpg?w=300;600;900&format=webp&as=metadata&srcset';
 * import myImageBase from './image.jpg?w=600&as=metadata';
 * 
 * <ResponsiveImage 
 *   src={myImageBase.src}
 *   srcSetAvif={myImageAvif.srcset}
 *   srcSetWebp={myImageWebp.srcset}
 *   width={myImageBase.width}
 *   height={myImageBase.height}
 *   alt="Description"
 * />
 */
export const ResponsiveImage: React.FC<ResponsiveImageProps> = ({
  src,
  srcSetAvif,
  srcSetWebp,
  placeholder,
  alt = '',
  className,
  ...props
}) => {
  return (
    <picture className={className}>
      {srcSetAvif && <source srcSet={srcSetAvif} type="image/avif" />}
      {srcSetWebp && <source srcSet={srcSetWebp} type="image/webp" />}
      <img
        src={src}
        alt={alt}
        loading="lazy"
        decoding="async"
        style={{
          backgroundSize: 'cover',
          backgroundImage: placeholder ? `url(${placeholder})` : undefined,
        }}
        {...props}
      />
    </picture>
  );
};
