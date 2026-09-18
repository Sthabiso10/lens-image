import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { LensError } from '@lens-image/core';
import type { StorageContext, StorageFile } from '@lens-image/core';
import { S3Adapter } from '../src/index.js';
import type { S3Module } from '../src/index.js';

const ctx: StorageContext = { attempt: 1, runId: 'test-run' };

const file = (key = 'hash/photo.webp'): StorageFile => ({
  key,
  data: new TextEncoder().encode('image-bytes'),
  contentType: 'image/webp',
  cacheControl: 'public, max-age=31536000, immutable',
  checksum: 'deadbeef',
});

/** One recorded `client.send()` call. */
interface SentCommand {
  readonly type: string;
  readonly input: Record<string, unknown>;
}

/**
 * A stub of the bits of `@aws-sdk/client-s3` the adapter touches.
 *
 * Testing against this rather than a live bucket means the assertions are
 * about the exact `PutObject` parameters we send - which is where the bugs
 * actually live (a missing CacheControl, an ACL sent to a bucket that rejects
 * ACLs) rather than in the HTTP round trip.
 */
function stubSdk(behaviour: { fail?: unknown; response?: Record<string, unknown> } = {}) {
  const sent: SentCommand[] = [];

  const command = (type: string) =>
    class {
      readonly type = type;
      constructor(readonly input: Record<string, unknown>) {}
    };

  const sdk: S3Module = {
    S3Client: class {
      constructor(readonly config: Record<string, unknown>) {}
      async send(command: { type: string; input: Record<string, unknown> }) {
        sent.push({ type: command.type, input: command.input });
        if (behaviour.fail) throw behaviour.fail;
        return behaviour.response ?? { ETag: '"abc123"' };
      }
      destroy() {}
    } as unknown as S3Module['S3Client'],
    PutObjectCommand: command('PutObject') as unknown as S3Module['PutObjectCommand'],
    HeadObjectCommand: command('HeadObject') as unknown as S3Module['HeadObjectCommand'],
    DeleteObjectCommand: command('DeleteObject') as unknown as S3Module['DeleteObjectCommand'],
  };

  return { sdk, sent };
}

describe('S3Adapter', () => {
  describe('configuration', () => {
    it('requires a bucket', () => {
      assert.throws(
        () => new S3Adapter({} as { bucket: string }),
        (error: unknown) => {
          assert.ok(LensError.is(error, 'ADAPTER_MISCONFIGURED'));
          assert.match(error.message, /needs a `bucket`/);
          return true;
        },
      );
    });

    it('requires a region, a client or an endpoint', () => {
      assert.throws(
        () => new S3Adapter({ bucket: 'b' }),
        (error: unknown) => {
          assert.ok(LensError.is(error, 'ADAPTER_MISCONFIGURED'));
          assert.match(error.message, /region is "auto"/, 'mentions the R2 case');
          return true;
        },
      );
    });

    it('accepts an endpoint without a region', () => {
      assert.doesNotThrow(
        () => new S3Adapter({ bucket: 'b', endpoint: 'https://minio.local' }),
      );
    });
  });

  describe('upload', () => {
    it('sends the expected PutObject parameters', async () => {
      const { sdk, sent } = stubSdk();
      const adapter = new S3Adapter({ bucket: 'my-images', region: 'us-east-1', sdk });

      const result = await adapter.upload(file(), ctx);

      assert.equal(sent.length, 1);
      assert.equal(sent[0]!.type, 'PutObject');
      assert.deepEqual(sent[0]!.input, {
        Bucket: 'my-images',
        Key: 'hash/photo.webp',
        Body: file().data,
        ContentType: 'image/webp',
        CacheControl: 'public, max-age=31536000, immutable',
      });
      assert.equal(result.etag, 'abc123', 'quotes stripped');
      assert.equal(result.size, 11);
    });

    it('omits ACL unless one is configured', async () => {
      // Sending any ACL to a bucket with Object Ownership enforced is a hard
      // failure, so the default has to be "send nothing".
      const { sdk, sent } = stubSdk();
      await new S3Adapter({ bucket: 'b', region: 'us-east-1', sdk }).upload(file(), ctx);

      assert.ok(!('ACL' in sent[0]!.input));
    });

    it('includes ACL, storage class and encryption when configured', async () => {
      const { sdk, sent } = stubSdk();
      const adapter = new S3Adapter({
        bucket: 'b',
        region: 'us-east-1',
        acl: 'public-read',
        storageClass: 'INTELLIGENT_TIERING',
        serverSideEncryption: 'aws:kms',
        kmsKeyId: 'key-1',
        sdk,
      });

      await adapter.upload(file(), ctx);

      assert.equal(sent[0]!.input.ACL, 'public-read');
      assert.equal(sent[0]!.input.StorageClass, 'INTELLIGENT_TIERING');
      assert.equal(sent[0]!.input.ServerSideEncryption, 'aws:kms');
      assert.equal(sent[0]!.input.SSEKMSKeyId, 'key-1');
    });

    it('applies the prefix to the key', async () => {
      const { sdk, sent } = stubSdk();
      const adapter = new S3Adapter({ bucket: 'b', region: 'us-east-1', prefix: '/products/', sdk });

      const result = await adapter.upload(file('a.webp'), ctx);

      assert.equal(sent[0]!.input.Key, 'products/a.webp');
      assert.equal(result.key, 'products/a.webp');
    });

    it('sanitises metadata into header-safe ASCII', async () => {
      // Non-ASCII metadata produces a signature error with no hint about which
      // key was at fault, so it is stripped before the request is built.
      const { sdk, sent } = stubSdk();
      const adapter = new S3Adapter({ bucket: 'b', region: 'us-east-1', sdk });

      await adapter.upload({ ...file(), metadata: { 'Uploaded By': 'café ☕', ok: 'plain' } }, ctx);

      assert.deepEqual(sent[0]!.input.Metadata, { 'uploaded-by': 'caf', ok: 'plain' });
    });

    it('merges putObjectParams last', async () => {
      const { sdk, sent } = stubSdk();
      const adapter = new S3Adapter({
        bucket: 'b',
        region: 'us-east-1',
        sdk,
        putObjectParams: { ContentDisposition: 'inline', ContentType: 'image/avif' },
      });

      await adapter.upload(file(), ctx);

      assert.equal(sent[0]!.input.ContentDisposition, 'inline');
      assert.equal(sent[0]!.input.ContentType, 'image/avif', 'the escape hatch wins');
    });

    it('explains an AccessDenied rather than echoing the SDK', async () => {
      const { sdk } = stubSdk({
        fail: Object.assign(new Error('Access Denied'), {
          name: 'AccessDenied',
          $metadata: { httpStatusCode: 403 },
        }),
      });
      const adapter = new S3Adapter({ bucket: 'locked', region: 'us-east-1', sdk });

      await assert.rejects(adapter.upload(file(), ctx), (error: unknown) => {
        assert.ok(LensError.is(error, 'UPLOAD_FAILED'));
        assert.match(error.message, /s3:PutObject/, 'names the IAM action to check');
        assert.match(error.message, /Object Ownership/, 'and the ACL trap');
        assert.equal(error.details.bucket, 'locked');
        return true;
      });
    });

    it('explains a wrong-region redirect', async () => {
      const { sdk } = stubSdk({ fail: Object.assign(new Error(), { name: 'PermanentRedirect' }) });
      const adapter = new S3Adapter({ bucket: 'elsewhere', region: 'us-east-1', sdk });

      await assert.rejects(adapter.upload(file(), ctx), (error: unknown) => {
        assert.ok(LensError.is(error));
        assert.match(error.message, /different region/);
        return true;
      });
    });
  });

  describe('exists', () => {
    it('is true when HeadObject succeeds', async () => {
      const { sdk } = stubSdk();
      const adapter = new S3Adapter({ bucket: 'b', region: 'us-east-1', sdk });
      assert.equal(await adapter.exists('a.webp'), true);
    });

    it('is false on 404 and on 403', async () => {
      // A 403 on HeadObject usually means the object is absent in a bucket that
      // does not grant s3:ListBucket - treating it as "missing" is correct.
      for (const status of [404, 403]) {
        const { sdk } = stubSdk({ fail: { $metadata: { httpStatusCode: status } } });
        const adapter = new S3Adapter({ bucket: 'b', region: 'us-east-1', sdk });
        assert.equal(await adapter.exists('a.webp'), false, `status ${status}`);
      }
    });

    it('rethrows a 500 rather than reporting "missing"', async () => {
      const { sdk } = stubSdk({ fail: { $metadata: { httpStatusCode: 500 }, name: 'InternalError' } });
      const adapter = new S3Adapter({ bucket: 'b', region: 'us-east-1', sdk });

      await assert.rejects(adapter.exists('a.webp'), (error: unknown) => LensError.is(error));
    });
  });

  describe('getUrl', () => {
    it('uses the regional virtual-hosted form by default', () => {
      const adapter = new S3Adapter({ bucket: 'my-images', region: 'eu-west-1' });
      assert.equal(adapter.getUrl('a/b.webp'), 'https://my-images.s3.eu-west-1.amazonaws.com/a/b.webp');
    });

    it('special-cases us-east-1, which has no region in its hostname', () => {
      const adapter = new S3Adapter({ bucket: 'my-images', region: 'us-east-1' });
      assert.equal(adapter.getUrl('a.webp'), 'https://my-images.s3.amazonaws.com/a.webp');
    });

    it('prefers publicUrl, so CDN requests do not hit the origin', () => {
      const adapter = new S3Adapter({
        bucket: 'my-images',
        region: 'us-east-1',
        publicUrl: 'https://cdn.example.com/',
      });
      assert.equal(adapter.getUrl('a.webp'), 'https://cdn.example.com/a.webp');
    });

    it('handles path-style endpoints for MinIO', () => {
      const adapter = new S3Adapter({
        bucket: 'images',
        endpoint: 'http://localhost:9000',
        forcePathStyle: true,
      });
      assert.equal(adapter.getUrl('a.webp'), 'http://localhost:9000/images/a.webp');
    });

    it('includes the prefix', () => {
      const adapter = new S3Adapter({ bucket: 'b', region: 'us-east-1', prefix: 'p' });
      assert.equal(adapter.getUrl('a.webp'), 'https://b.s3.amazonaws.com/p/a.webp');
    });
  });

  describe('dispose', () => {
    it('does not destroy a client it was given', async () => {
      let destroyed = false;
      const client = {
        async send() {
          return {};
        },
        destroy: () => {
          destroyed = true;
        },
      };

      await new S3Adapter({ bucket: 'b', region: 'us-east-1', client }).dispose();

      assert.equal(destroyed, false, 'the caller owns the client they passed in');
    });
  });
});
