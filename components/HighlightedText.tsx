// ============================================================
// HighlightedText - 専門用語タップで用語辞典ポップアップ
// ============================================================
import { useMemo } from 'react';
import { Text, StyleSheet, TextStyle } from 'react-native';
import { ALL_GLOSSARY } from '../data';
import { GlossaryTerm } from '../types';
import { useThemeColors } from '../hooks/useThemeColors';

type Segment =
  | { type: 'text'; content: string }
  | { type: 'term'; content: string; glossary: GlossaryTerm };

// 用語を長い順にソート（長い用語を優先マッチ）
const SORTED_TERMS = [...ALL_GLOSSARY].sort((a, b) => b.term.length - a.term.length);

function parseText(text: string): Segment[] {
  const segments: Segment[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    let earliest = Infinity;
    let matchedTerm: GlossaryTerm | null = null;

    for (const term of SORTED_TERMS) {
      const idx = remaining.indexOf(term.term);
      if (idx !== -1 && (idx < earliest || (idx === earliest && term.term.length > (matchedTerm?.term.length ?? 0)))) {
        earliest = idx;
        matchedTerm = term;
      }
    }

    if (matchedTerm !== null && earliest !== Infinity) {
      if (earliest > 0) {
        segments.push({ type: 'text', content: remaining.slice(0, earliest) });
      }
      segments.push({ type: 'term', content: matchedTerm.term, glossary: matchedTerm });
      remaining = remaining.slice(earliest + matchedTerm.term.length);
    } else {
      segments.push({ type: 'text', content: remaining });
      break;
    }
  }

  return segments;
}

type Props = {
  text: string;
  style?: TextStyle;
  onTermPress: (term: GlossaryTerm) => void;
};

export function HighlightedText({ text, style, onTermPress }: Props) {
  const segments = useMemo(() => parseText(text), [text]);
  const colors = useThemeColors();

  return (
    <Text style={style}>
      {segments.map((seg, i) =>
        seg.type === 'term' ? (
          <Text
            key={i}
            style={[style, styles.term, { color: colors.primary }]}
            onPress={() => onTermPress(seg.glossary)}
          >
            {seg.content}
          </Text>
        ) : (
          seg.content
        ),
      )}
    </Text>
  );
}

const styles = StyleSheet.create({
  term: {
    textDecorationLine: 'underline',
  },
});
