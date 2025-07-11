
'use server';
/**
 * @fileOverview A Genkit flow to find candidate images for artworks on Wikimedia Commons.
 *
 * - findWikimediaImages - A function that searches for images and returns candidates.
 */

import { ai } from '@/ai/genkit';
import {
  FindWikimediaImagesInputSchema,
  FindWikimediaImagesOutputSchema,
  type FindWikimediaImagesInput,
  type FindWikimediaImagesOutput,
  type WikimediaImageCandidate
} from '@/types';


const PERMISSIVE_LICENSES = ['public domain', 'pd-', 'cc0', 'cc by'];
const MAX_SEARCH_RESULTS = 8; // Max number of candidates to return


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
  async ({ searchTerm }) => {
    console.log(`[findWikimediaImagesFlow] Searching for: "${searchTerm}"`);
    
    const searchUrl = new URL('https://commons.wikimedia.org/w/api.php');
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
