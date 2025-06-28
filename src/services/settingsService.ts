// src/services/settingsService.ts
'use server';

import { adminDb } from '@/lib/firebase-admin';
import type { AvailableModels, ScriptSettings } from '@/types';
import fs from 'fs/promises';
import path from 'path';

const SETTINGS_COLLECTION = 'appSettings';
const SCRIPT_DEFAULTS_DOC_ID = 'scriptDefaults';

const DEFAULT_SETTINGS: ScriptSettings = {
  populateQuestions: {
    targetPerDifficulty: 200,
    maxNewPerRun: 25,
    batchSize: 25,
    defaultModel: 'googleai/gemini-2.5-flash',
  },
  populateImages: {
    limit: 10,
    delay: 2000,
  },
};

/**
 * Retrieves the script settings from Firestore. If not found, returns default values.
 * @returns A promise resolving to the ScriptSettings object.
 */
export async function getScriptSettings(): Promise<ScriptSettings> {
  try {
    const settingsRef = adminDb.collection(SETTINGS_COLLECTION).doc(SCRIPT_DEFAULTS_DOC_ID);
    const docSnap = await settingsRef.get();

    if (docSnap.exists) {
      // Merge with defaults to ensure all keys are present
      const data = docSnap.data();
      if (!data) return DEFAULT_SETTINGS;
      return {
        populateQuestions: { ...DEFAULT_SETTINGS.populateQuestions, ...data.populateQuestions },
        populateImages: { ...DEFAULT_SETTINGS.populateImages, ...data.populateImages },
      };
    } else {
      // If no settings document exists, return the hardcoded defaults
      return DEFAULT_SETTINGS;
    }
  } catch (error) {
    console.error('[settingsService] Error fetching script settings:', error);
    // Return defaults in case of error
    return DEFAULT_SETTINGS;
  }
}

/**
 * Updates the script settings in Firestore.
 * @param settings - The new settings to save.
 */
export async function updateScriptSettings(settings: ScriptSettings): Promise<void> {
  try {
    const settingsRef = adminDb.collection(SETTINGS_COLLECTION).doc(SCRIPT_DEFAULTS_DOC_ID);
    await settingsRef.set(settings, { merge: true });
  } catch (error) {
    console.error('[settingsService] Error updating script settings:', error);
    throw new Error('Failed to update script settings.');
  }
}


/**
 * Reads the available models from the local models.json file.
 * This is a server action to securely read from the file system.
 * @returns A promise resolving to the AvailableModels object.
 */
export async function getAvailableModels(): Promise<AvailableModels> {
  try {
    const filePath = path.join(process.cwd(), 'src', 'data', 'models.json');
    const fileContent = await fs.readFile(filePath, 'utf-8');
    const models: AvailableModels = JSON.parse(fileContent);
    return models;
  } catch (error) {
    console.error('[settingsService] Error reading models.json:', error);
    // Return a default/empty structure in case of error
    return {
      textModels: ['googleai/gemini-2.5-flash'],
      imageModels: ['googleai/gemini-2.0-flash-preview-image-generation']
    };
  }
}
