'use server';
/**
 * @fileOverview A Genkit flow to find candidate images for artworks on Wikimedia Commons.
 *
 * - findWikimediaImages - A function that searches for images and returns candidates.
 * - FindWikimediaImagesInput - The input type for the findWikimediaImages function.
 * - FindWikimediaImagesOutput - The return type for the findWikimediaImages function.
 */

import { ai } from '@/ai/genkit';
import { z } from 'zod';

const PERMISSIVE_LICENSES = ['public domain', 'pd-', 'cc0', 'cc by'];
const MAX_SEARCH_RESULTS = 8; // Max number of candidates to return

export const FindWikimediaImagesInputSchema = z.object({
  artworkTitle: z.string().describe("The title of the artwork to search for."),
  artworkAuthor: z.string().optional().describe("The author of the artwork."),
});
export type FindWikimediaImagesInput = z.infer<typeof FindWikimediaImagesInputSchema>;

export const WikimediaImageCandidateSchema = z.object({
  pageUrl: z.string().url().describe("The URL to the Wikimedia Commons file page."),
  thumbnailUrl: z.string().url().describe("The URL for a thumbnail version of the image."),
  fullUrl: z.string().url().describe("The URL for the full-sized version of the image."),
  license: z.string().describe("The short name of the license (e.g., 'Public domain', 'CC BY-SA 4.0')."),
  title: z.string().describe("The title of the file on Wikimedia."),
});
export type WikimediaImageCandidate = z.infer<typeof WikimediaImageCandidateSchema>;

export const FindWikimediaImagesOutputSchema = z.array(WikimediaImageCandidateSchema);
export type FindWikimediaImagesOutput = z.infer<typeof FindWikimediaImagesOutputSchema>;


export async function findWikimediaImages(input: FindWikimediaImagesInput): Promise<FindWikimediaImagesOutput> {
  return findWikimediaImagesFlow(input);
}


async function fetchImageInfo(pageTitle: string): Promise<WikimediaImageCandidate | null> {
    const infoUrl = new URL('https://commons.wikimedia.org/w/api.php');
    infoUrl.search = new URLSearchParams({
        action: 'query',
        titles: pageTitle,
        prop: 'imageinfo',
        iiprop: 'url|extmetadata',
        iiurlwidth: '300', // Request a 300px wide thumbnail
        format: 'json',
        origin: '*',
    }).toString();

    const infoResponse = await fetch(infoUrl);
    if (!infoResponse.ok) return null;
    
    const infoResult = await infoResponse.json();
    const pages = infoResult.query.pages;
    const pageId = Object.keys(pages)[0];
    const imageInfo = pages[pageId]?.imageinfo?.[0];
    const extMetadata = imageInfo?.extmetadata;

    if (!imageInfo || !extMetadata) return null;

    const licenseShortName = (extMetadata.LicenseShortName?.value || '').toLowerCase();
    const isPermissive = PERMISSIVE_LICENSES.some(p => licenseShortName.includes(p));

    if (!isPermissive) return null;

    return {
        pageUrl: imageInfo.descriptionurl || '',
        thumbnailUrl: imageInfo.thumburl || '',
        fullUrl: imageInfo.url || '',
        license: extMetadata.LicenseShortName?.value || 'Unknown',
        title: pageTitle,
    };
}


const findWikimediaImagesFlow = ai.defineFlow(
  {
    name: 'findWikimediaImagesFlow',
    inputSchema: FindWikimediaImagesInputSchema,
    outputSchema: FindWikimediaImagesOutputSchema,
  },
  async ({ artworkTitle, artworkAuthor }) => {
    console.log(`[findWikimediaImagesFlow] Searching for: "${artworkTitle}" by ${artworkAuthor}`);
    
    const searchUrl = new URL('https://commons.wikimedia.org/w/api.php');
    const searchTerm = `"${artworkTitle}" ${artworkAuthor ? `"${artworkAuthor}"` : ''}`;
    searchUrl.search = new URLSearchParams({
        action: 'query',
        list: 'search',
        srsearch: searchTerm,
        srnamespace: '6', // File namespace
        srlimit: (MAX_SEARCH_RESULTS * 2).toString(), // Fetch more to have better chance of finding licensed ones
        format: 'json',
        origin: '*',
    }).toString();

    const searchResponse = await fetch(searchUrl);
    if (!searchResponse.ok) {
      console.error(`[findWikimediaImagesFlow] Search request failed with status: ${searchResponse.status}`);
      return [];
    }

    const searchResult = await searchResponse.json();
    const searchHits = searchResult?.query?.search || [];

    if (searchHits.length === 0) {
      console.log(`[findWikimediaImagesFlow] No file pages found for search term: ${searchTerm}`);
      return [];
    }

    const infoPromises = searchHits.map((hit: { title: string }) => fetchImageInfo(hit.title));
    const candidates = (await Promise.all(infoPromises)).filter((c): c is WikimediaImageCandidate => c !== null);

    return candidates.slice(0, MAX_SEARCH_RESULTS);
  }
);
