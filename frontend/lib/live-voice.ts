export async function decodeLiveServerMessage<T>(data: string | Blob | ArrayBuffer) {
  let json: string;
  if (typeof data === "string") {
    json = data;
  } else if (data instanceof Blob) {
    json = await data.text();
  } else {
    json = new TextDecoder().decode(data);
  }
  return JSON.parse(json) as T;
}
