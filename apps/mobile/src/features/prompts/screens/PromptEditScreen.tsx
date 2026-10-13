import { useLocalSearchParams, useRouter, Stack } from "expo-router";
import { useEffect, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import { useTranslation } from "react-i18next";
import { hasPromptContent } from "@prompthub/shared/utils/prompt-content";

import { AppScreen } from "@/components/AppScreen";
import { AppText } from "@/components/AppText";
import { showPlatformAlert } from "@/components/platformAlerts";
import { promptRepository } from "@/features/prompts/data/promptRepository";
import { useThemePalette } from "@/theme/colors";

export function PromptEditScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const palette = useThemePalette();
  const { t } = useTranslation();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [userPrompt, setUserPrompt] = useState("");
  const [saving, setSaving] = useState(false);

  const isEditing = !!id;

  useEffect(() => {
    let mounted = true;
    if (id) {
      void promptRepository
        .getById(id)
        .then((data) => {
          if (mounted && data) {
            setTitle(data.title);
            setDescription(data.description || "");
            setSystemPrompt(data.systemPrompt || "");
            setUserPrompt(data.userPrompt);
          }
        })
        .catch(() => {
          if (mounted) {
            showPlatformAlert(
              t("prompts.workflow.loadErrorTitle"),
              t("prompts.workflow.loadError"),
            );
          }
        });
    }
    return () => {
      mounted = false;
    };
  }, [id, t]);

  const handleSave = async () => {
    if (!title.trim() || !hasPromptContent({ systemPrompt, userPrompt })) {
      showPlatformAlert(
        t("prompts.workflow.validationTitle"),
        t("prompts.workflow.validationRequired"),
      );
      return;
    }

    setSaving(true);
    try {
      const values = {
        title: title.trim(),
        description: description.trim(),
        systemPrompt: systemPrompt.trim(),
        userPrompt: userPrompt.trim(),
      };
      if (isEditing) {
        await promptRepository.update(id, values);
      } else {
        await promptRepository.create({
          id: `prompt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          ...values,
          tags: [],
          isFavorite: false,
        });
      }
      router.back();
    } catch {
      showPlatformAlert(
        t("prompts.workflow.saveErrorTitle"),
        t("prompts.workflow.saveError"),
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <AppScreen>
      <Stack.Screen
        options={{
          title: isEditing
            ? t("prompts.workflow.editTitle")
            : t("prompts.workflow.createTitle"),
          headerRight: () => (
            <Pressable disabled={saving} onPress={handleSave}>
              <AppText
                style={{
                  color: palette.accent,
                  fontWeight: "600",
                  fontSize: 17,
                }}
              >
                {t("prompts.workflow.save")}
              </AppText>
            </Pressable>
          ),
          headerLeft: () => (
            <Pressable onPress={() => router.back()}>
              <AppText style={{ color: palette.accent, fontSize: 17 }}>
                {t("prompts.workflow.cancel")}
              </AppText>
            </Pressable>
          ),
        }}
      />
      <ScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.section}>
          <AppText
            variant="subtitle"
            style={[styles.label, { color: palette.text }]}
          >
            {t("prompts.workflow.title")} *
          </AppText>
          <TextInput
            style={[
              styles.input,
              {
                backgroundColor: palette.surface,
                color: palette.text,
                borderColor: palette.border,
              },
            ]}
            value={title}
            onChangeText={setTitle}
            placeholder={t("prompts.workflow.titlePlaceholder")}
            placeholderTextColor={palette.muted}
          />
        </View>

        <View style={styles.section}>
          <AppText
            variant="subtitle"
            style={[styles.label, { color: palette.text }]}
          >
            {t("prompts.workflow.description")}
          </AppText>
          <TextInput
            style={[
              styles.input,
              {
                backgroundColor: palette.surface,
                color: palette.text,
                borderColor: palette.border,
              },
            ]}
            value={description}
            onChangeText={setDescription}
            placeholder={t("prompts.workflow.descriptionPlaceholder")}
            placeholderTextColor={palette.muted}
          />
        </View>

        <View style={styles.section}>
          <AppText
            variant="subtitle"
            style={[styles.label, { color: palette.text }]}
          >
            {t("prompts.workflow.systemPrompt")}
          </AppText>
          <TextInput
            style={[
              styles.input,
              styles.textArea,
              {
                backgroundColor: palette.surface,
                color: palette.text,
                borderColor: palette.border,
              },
            ]}
            value={systemPrompt}
            onChangeText={setSystemPrompt}
            placeholder={t("prompts.workflow.systemPromptPlaceholder")}
            placeholderTextColor={palette.muted}
            multiline
            textAlignVertical="top"
          />
        </View>

        <View style={styles.section}>
          <AppText
            variant="subtitle"
            style={[styles.label, { color: palette.text }]}
          >
            {t("prompts.workflow.userPrompt")}
          </AppText>
          <TextInput
            style={[
              styles.input,
              styles.textArea,
              {
                backgroundColor: palette.surface,
                color: palette.text,
                borderColor: palette.border,
              },
            ]}
            value={userPrompt}
            onChangeText={setUserPrompt}
            placeholder={t("prompts.workflow.userPromptPlaceholder")}
            placeholderTextColor={palette.muted}
            multiline
            textAlignVertical="top"
          />
        </View>
      </ScrollView>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
    paddingBottom: 40,
    gap: 20,
  },
  section: {
    gap: 8,
  },
  label: {
    fontWeight: "600",
    marginLeft: 4,
  },
  input: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    fontSize: 16,
  },
  textArea: {
    minHeight: 120,
    paddingTop: 12,
  },
});
