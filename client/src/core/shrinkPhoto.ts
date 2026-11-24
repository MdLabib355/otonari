const JPEG_QUALITY = 0.8;

// Makes a new, smaller JPEG out of any photo. Phone photos are often larger than the server's 5 MB
// limit, and they can contain the GPS position of someone's home; the new JPEG has neither problem.
// Portrait photos stay upright: the browser turns an <img> the way the camera was held (EXIF
// orientation), and the canvas copies it like that. `square` cuts off what sticks out (profile photos).
export async function shrinkPhoto(file: File, maxSide: number, square = false): Promise<Blob> {
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode(); // fails if the browser can't read this file as an image

    const side = Math.min(image.naturalWidth, image.naturalHeight);
    const width = square ? side : image.naturalWidth;
    const height = square ? side : image.naturalHeight;
    const scale = Math.min(1, maxSide / Math.max(width, height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);

    const context = canvas.getContext('2d');
    if (!context) throw new Error('This browser has no canvas');
    context.fillStyle = 'white'; // JPEG can't be see-through: such parts of a PNG would turn black
    context.fillRect(0, 0, canvas.width, canvas.height);
    const left = (image.naturalWidth - width) / 2;
    const top = (image.naturalHeight - height) / 2;
    context.drawImage(image, left, top, width, height, 0, 0, canvas.width, canvas.height);

    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((jpeg) => (jpeg ? resolve(jpeg) : reject(new Error('Empty image'))), 'image/jpeg', JPEG_QUALITY);
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}
