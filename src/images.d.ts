declare module '*?as=metadata' {
  const content: {
    src: string;
    width: number;
    height: number;
    format: string;
    space: string;
    channels: number;
    density: number;
  };
  export default content;
}

declare module '*?as=metadata&srcset' {
  const content: {
    src: string;
    width: number;
    height: number;
    format: string;
    srcset: string;
  };
  export default content;
}

declare module '*?as=picture' {
  interface PictureSource {
    [key: string]: string;
  }
  const content: {
    sources: {
      avif: string;
      webp: string;
      [key: string]: string;
    };
    fallback: {
      src: string;
      w: number;
      h: number;
    };
  };
  export default content;
}

// Support for simple width/height/format queries that return metadata
declare module '*&as=metadata' {
  const content: {
    src: string;
    width: number;
    height: number;
    format: string;
  };
  export default content;
}

// Support for lqip (Low Quality Image Placeholder) style imports
declare module '*?w=20&blur=10&as=metadata' {
  const content: {
    src: string;
    width: number;
    height: number;
  };
  export default content;
}
