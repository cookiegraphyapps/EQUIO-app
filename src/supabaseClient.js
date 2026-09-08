import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Verkleinert ein Bild auf max. 1600px Kantenlänge und komprimiert es als JPEG,
// damit der begrenzte Foto-Speicher (Supabase Free: 1 GB) nicht zu schnell voll wird.
// Fällt bei Problemen (z.B. nicht unterstütztes Format) auf die Originaldatei zurück.
async function compressImage(file, maxDim = 1600, quality = 0.8) {
  if (!file.type.startsWith("image/")) return file;
  try {
    const objectUrl = URL.createObjectURL(file);
    const img = await new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = reject;
      image.src = objectUrl;
    });
    let { width, height } = img;
    if (width > maxDim || height > maxDim) {
      if (width > height) { height = Math.round(height * (maxDim / width)); width = maxDim; }
      else { width = Math.round(width * (maxDim / height)); height = maxDim; }
    }
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    canvas.getContext("2d").drawImage(img, 0, 0, width, height);
    URL.revokeObjectURL(objectUrl);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
    if (!blob) return file;
    return new File([blob], file.name.replace(/\.\w+$/, ".jpg"), { type: "image/jpeg" });
  } catch {
    return file; // Bei jedem Problem lieber das Original hochladen als gar nichts
  }
}

// Lädt ein Bild (komprimiert) in den "horse-photos"-Bucket hoch und gibt die öffentliche URL zurück.
export async function uploadPhoto(file, folder) {
  const upload = await compressImage(file);
  const ext = upload.name.split(".").pop() || "jpg";
  const path = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
  const { error } = await supabase.storage.from("horse-photos").upload(path, upload, { cacheControl: "3600", contentType: upload.type || "image/jpeg" });
  if (error) throw error;
  const { data } = supabase.storage.from("horse-photos").getPublicUrl(path);
  return data.publicUrl;
}
