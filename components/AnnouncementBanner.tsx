// ============================================================
// お知らせバナーコンポーネント
// ホーム画面上部に表示。severity ごとに色分け、type ごとにアイコン付き。
// critical は dismiss 不可、info/warning は dismiss 可能。
// ============================================================

import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useAnnouncements, type Announcement, type AnnouncementSeverity, type AnnouncementType } from '../hooks/useAnnouncements';
import { useThemeColors, type ThemeColors } from '../hooks/useThemeColors';
import { FontSize, Spacing, BorderRadius, Shadow } from '../constants/theme';

// ─── アイコンマップ ───

const TYPE_ICONS: Record<AnnouncementType, string> = {
  maintenance: '\uD83D\uDD27', // wrench
  update: '\uD83D\uDCE6',     // package
  legal: '\u2696\uFE0F',      // scales
  info: '\u2139\uFE0F',       // info
};

// ─── severity 別スタイル取得 ───

function getSeverityColors(
  severity: AnnouncementSeverity,
  C: ThemeColors,
): { bg: string; text: string; dismiss: string } {
  switch (severity) {
    case 'critical':
      return { bg: '#DC2626', text: '#FFFFFF', dismiss: '#FFFFFF' };
    case 'warning':
      return { bg: C.warningSurface, text: C.accentDark, dismiss: C.accentDark };
    case 'info':
    default:
      return { bg: C.primarySurface, text: C.primary, dismiss: C.primary };
  }
}

// ─── 個別バナー ───

function BannerItem({
  item,
  colors,
  onDismiss,
}: {
  item: Announcement;
  colors: ThemeColors;
  onDismiss: (id: string) => void;
}) {
  const sc = getSeverityColors(item.severity, colors);
  const canDismiss = item.severity !== 'critical';

  return (
    <View
      style={[
        styles.banner,
        Shadow.sm,
        { backgroundColor: sc.bg },
      ]}
    >
      <Text style={styles.icon}>{TYPE_ICONS[item.type]}</Text>

      <View style={styles.content}>
        <Text style={[styles.title, { color: sc.text }]}>
          {item.title}
        </Text>
        <Text style={[styles.body, { color: sc.text, opacity: 0.85 }]}>
          {item.body}
        </Text>
      </View>

      {canDismiss && (
        <Pressable
          onPress={() => onDismiss(item.id)}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="このお知らせを閉じる"
          style={styles.dismissBtn}
        >
          <Text style={[styles.dismissText, { color: sc.dismiss }]}>
            {'\u2715'}
          </Text>
        </Pressable>
      )}
    </View>
  );
}

// ─── メインコンポーネント ───

export function AnnouncementBanner() {
  const { announcements, loading, dismissAnnouncement } = useAnnouncements();
  const colors = useThemeColors();

  if (loading || announcements.length === 0) {
    return null;
  }

  return (
    <View style={styles.container}>
      {announcements.map((item) => (
        <BannerItem
          key={item.id}
          item={item}
          colors={colors}
          onDismiss={dismissAnnouncement}
        />
      ))}
    </View>
  );
}

// ─── スタイル ───

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.sm,
    gap: Spacing.sm,
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  icon: {
    fontSize: 18,
    marginTop: 1,
  },
  content: {
    flex: 1,
  },
  title: {
    fontSize: FontSize.footnote,
    fontWeight: '700',
  },
  body: {
    fontSize: FontSize.caption,
    marginTop: 2,
    lineHeight: 18,
  },
  dismissBtn: {
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  dismissText: {
    fontSize: 16,
    fontWeight: '600',
  },
});
