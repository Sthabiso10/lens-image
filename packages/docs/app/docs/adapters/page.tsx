import type { Metadata } from 'next';
import { CodeBlock, CommandLine } from '@/components/CodeBlock';
import { Callout, PageHeader, Prose } from '@/components/Prose';

export const metadata: Metadata = { title: 'Storage adapters' };

const INTERFACE = `interface StorageAdapter {
  readonly name: string;
  upload(file: StorageFile, ctx: StorageContext): Promise<StorageObject>;

  exists?(key: string): Promise<boolean>;   // unlocks cache: 'storage'
  remove?(key: string): Promise<void>;      // unlocks optimizer.delete()
  getUrl?(key: string): string;
  dispose?(): Promise<void> | void;
}`;

const S3 = `import { S3Adapter } from '@lens-image/adapter-s3';

new S3Adapter({
  bucket: 'my-images',
  region: 'us-east-1',
  prefix: 'products',
  publicUrl: 'https://cdn.example.com',   // your CloudFront distribution
});`;

const R2 = `new S3Adapter({
  bucket: 'images',
  region: 'auto',
  endpoint: \`https://\${accountId}.r2.cloudflarestorage.com\`,
  credentials: { accessKeyId: R2_KEY, secretAccessKey: R2_SECRET },
  publicUrl: 'https://images.example.com',
});`;

const MINIO = `new S3Adapter({
  bucket: 'images',
  endpoint: 'http://localhost:9000',
  forcePathStyle: true,
  credentials: { accessKeyId: 'minioadmin', secretAccessKey: 'minioadmin' },
});`;

const LOCAL = `import { LocalAdapter } from '@lens-image/adapter-local';

new LocalAdapter({
  root: './public/uploads',   // where files land
  baseUrl: '/uploads',        // how the browser reaches them
});`;

const EXPRESS = `const adapter = new LocalAdapter({ root: './uploads', baseUrl: '/images' });

app.use('/images', express.static(adapter.root, {
  immutable: true,
  maxAge: '1y',   // safe: keys are content-addressed
}));`;

const CLOUDINARY = `import { CloudinaryAdapter } from '@lens-image/adapter-cloudinary';

new CloudinaryAdapter({
  cloudName: process.env.CLOUDINARY_CLOUD_NAME!,
  apiKey: process.env.CLOUDINARY_API_KEY!,
  apiSecret: process.env.CLOUDINARY_API_SECRET!,
  folder: 'products',
});`;

const CUSTOM = `import { Storage } from '@google-cloud/storage';
import type { StorageAdapter } from '@lens-image/core';

export class GCSAdapter implements StorageAdapter {
  readonly name = 'gcs';
  #bucket = new Storage().bucket(this.bucketName);

  constructor(private bucketName: string) {}

  async upload(file) {
    const object = this.#bucket.file(file.key);
    await object.save(file.data, {
      contentType: file.contentType,
      metadata: { cacheControl: file.cacheControl },
    });
    return {
      key: file.key,
      url: \`https://storage.googleapis.com/\${this.bucketName}/\${file.key}\`,
      size: file.data.byteLength,
    };
  }

  async exists(key) {
    const [exists] = await this.#bucket.file(key).exists();
    return exists;
  }

  async remove(key) {
    await this.#bucket.file(key).delete({ ignoreNotFound: true });
  }
}`;

const MEMORY = `import { MemoryAdapter, ImageOptimizer, createPassthroughEngine } from '@lens-image/core';

const adapter = new MemoryAdapter();
const optimizer = new ImageOptimizer({ adapter, engine: createPassthroughEngine() });

await optimizer.optimize({ source: bytes, formats: ['webp'] });

adapter.keys();                  // ['a1b2c3d4e5/photo-original.webp']
adapter.get(key)?.data;          // the encoded bytes

// Injected failures, for testing retry behaviour without mocking a network.
new MemoryAdapter({ failAttempts: 2 });`;

export default function AdaptersPage() {
  return (
    <>
      <PageHeader
        section="Reference"
        title="Storage adapters"
        lead="One interface, one required method. S3, filesystem and Cloudinary ship today; anything else is about forty lines."
      />

      <Prose>
        <h2>The contract</h2>
        <CodeBlock code={INTERFACE} language="ts" />
        <p>
          Only <code>upload</code> is required. Lens handles retries, bounded concurrency
          and error wrapping around whatever you implement, so an adapter is genuinely just
          the storage call.
        </p>

        <h2>S3, and anything that speaks it</h2>
        <CommandLine command="npm install @lens-image/adapter-s3 @aws-sdk/client-s3" />
        <p>
          The AWS SDK is a peer dependency. It is ~15&nbsp;MB installed and you almost
          certainly already have it; pinning our own copy would duplicate it and fight your
          version choices.
        </p>
        <CodeBlock code={S3} language="ts" />

        <Callout tone="warn" title="No ACL is sent by default">
          Buckets created since April 2023 have Object Ownership set to{' '}
          <em>Bucket owner enforced</em>, where sending <strong>any</strong> ACL, including{' '}
          <code>private</code>, fails with <code>AccessControlListNotSupported</code>. Use
          a bucket policy or a CloudFront origin access control instead. If your bucket
          genuinely uses ACLs, set <code>acl: &apos;public-read&apos;</code> explicitly.
        </Callout>

        <h3>Cloudflare R2</h3>
        <CodeBlock code={R2} language="ts" />

        <h3>MinIO and self-hosted</h3>
        <CodeBlock code={MINIO} language="ts" />
        <p>
          <code>forcePathStyle</code> is required by MinIO and most self-hosted S3
          services. DigitalOcean Spaces and Backblaze B2 work the same way, set{' '}
          <code>endpoint</code> and, for Spaces, <code>publicUrl</code> to the CDN
          hostname.
        </p>

        <h3>Error messages</h3>
        <p>
          SDK errors are translated into ones that name the likely cause, because{' '}
          <code>AccessDenied</code> on its own has never helped anybody:
        </p>
        <CodeBlock
          language="text"
          code={`S3 AccessDenied for "a/b.webp" in "my-images". Check the IAM policy grants
s3:PutObject on this bucket, and that any configured ACL is allowed by
Object Ownership settings.

S3 PermanentRedirect for "a/b.webp" in "my-images". The bucket "my-images"
lives in a different region than the one configured.`}
        />

        <h2>Filesystem</h2>
        <CommandLine command="npm install @lens-image/adapter-local" />
        <CodeBlock code={LOCAL} language="ts" />
        <p>
          Writes are atomic by default, each file goes to a temp name and is then renamed
          into place, so a crash mid-write leaves the previous file intact rather than a
          truncated one, and a concurrent reader never sees half an image.
        </p>
        <p>
          Every key is resolved against <code>root</code> and refused if it escapes. Lens
          generates keys itself, but a custom <code>key</code> function could interpolate a
          user-supplied filename, so that has to be impossible here rather than assumed
          away upstream.
        </p>
        <h3>Serving the files</h3>
        <CodeBlock code={EXPRESS} language="ts" />

        <h2>Cloudinary</h2>
        <CommandLine command="npm install @lens-image/adapter-cloudinary" />
        <p>
          Zero dependencies, signed uploads are an HTTP POST with a SHA-1 signature, which{' '}
          <code>node:crypto</code> and the built-in <code>fetch</code> cover in a couple of
          hundred lines.
        </p>
        <CodeBlock code={CLOUDINARY} language="ts" />
        <Callout title="Should you use this?">
          Cloudinary already does transformation. If it is your only image pipeline, its
          own URL-based transforms are usually the simpler answer. This adapter earns its
          place when you want Lens to own the pipeline, identical output across S3, disk
          and Cloudinary, or when you are migrating and want one code path.
        </Callout>

        <h2>Writing your own</h2>
        <p>A complete Google Cloud Storage adapter:</p>
        <CodeBlock code={CUSTOM} language="ts" filename="gcs-adapter.ts" />
        <p>
          <code>exists</code> unlocks storage-aware caching; <code>remove</code> unlocks{' '}
          <code>optimizer.delete()</code>. Both are optional, and calling a method an
          adapter does not implement gives a clear <code>ADAPTER_UNSUPPORTED</code> rather
          than a <code>TypeError</code>.
        </p>

        <h3>What a good adapter does</h3>
        <ul>
          <li>
            <strong>Throws on failure.</strong> Do not swallow errors or return a partial
            result. Lens needs the throw to trigger a retry.
          </li>
          <li>
            <strong>Returns the key it actually wrote.</strong> If you prefix or rewrite,
            report the final key so deletion and caching address the right object.
          </li>
          <li>
            <strong>Honours <code>ctx.signal</code></strong> where the client supports it,
            so cancellation is not just cosmetic.
          </li>
          <li>
            <strong>Leaves retrying to the core.</strong> Adapter-level retries compound
            with the ones above them into surprising delays.
          </li>
        </ul>

        <h2>MemoryAdapter</h2>
        <p>
          Ships in the core. It is the reference implementation of the contract, about
          forty lines of real logic, and it makes every example runnable without
          credentials.
        </p>
        <CodeBlock code={MEMORY} language="ts" />
      </Prose>
    </>
  );
}
