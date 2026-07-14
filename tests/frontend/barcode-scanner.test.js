import assert from "node:assert/strict";
import test from "node:test";

test("lookupProduct returns product name and nutrition for found barcode", async () => {
  const fakeProduct = {
    status: 1,
    product: {
      product_name: "Test Whey Protein",
      nutriments: {
        "energy-kcal_100g": 380,
        proteins_100g: 80,
        carbohydrates_100g: 10,
        fat_100g: 5,
      },
    },
  };

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: true,
    json: async () => fakeProduct,
  });

  const { lookupProduct } = await import("../../site/barcode-scanner.js");
  const result = await lookupProduct("123456789");

  assert.equal(result.barcode, "123456789");
  assert.equal(result.name, "Test Whey Protein");
  assert.equal(result.kcal_per_100g, 380);
  assert.equal(result.protein_per_100g, 80);
  assert.equal(result.carbs_per_100g, 10);
  assert.equal(result.fat_per_100g, 5);
  assert.match(result.detail, /380 kcal/);
  assert.match(result.detail, /80g protein/);

  globalThis.fetch = originalFetch;
});

test("lookupProduct returns null name for unknown barcode", async () => {
  const fakeResponse = { status: 0 };

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: true,
    json: async () => fakeResponse,
  });

  const { lookupProduct } = await import("../../site/barcode-scanner.js");
  const result = await lookupProduct("000000000");

  assert.equal(result.barcode, "000000000");
  assert.equal(result.name, null);
  assert.equal(result.detail, null);

  globalThis.fetch = originalFetch;
});

test("lookupProduct returns null name on fetch error", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new Error("Network failure");
  };

  const { lookupProduct } = await import("../../site/barcode-scanner.js");
  const result = await lookupProduct("999999999");

  assert.equal(result.barcode, "999999999");
  assert.equal(result.name, null);

  globalThis.fetch = originalFetch;
});

test("lookupProduct handles missing nutriments gracefully", async () => {
  const fakeProduct = {
    status: 1,
    product: {
      product_name: "Plain Chicken Breast",
    },
  };

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: true,
    json: async () => fakeProduct,
  });

  const { lookupProduct } = await import("../../site/barcode-scanner.js");
  const result = await lookupProduct("111111111");

  assert.equal(result.name, "Plain Chicken Breast");
  assert.equal(result.kcal_per_100g, null);
  assert.equal(result.protein_per_100g, null);
  assert.equal(result.detail, "");

  globalThis.fetch = originalFetch;
});
