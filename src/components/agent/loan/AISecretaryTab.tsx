// Elara — broker mobile view.
//
// Single-column swipe-to-assign list. Top section shows the AI start/pause
// controls + a chip for any open AI questions (the legacy Q&A surface
// moves into a sheet on tap rather than dominating the tab).
//
// Each row is an <AssignmentRow>:
//   - Swipe LEFT  → send to AI
//   - Swipe RIGHT → keep with broker (self)
//   - Tap         → open <TaskDetailSheet> with the full objective +
//                   completion-criteria + segmented reassign fallback.
//
// Visual identity:
//   `[ AI ] <label>` (petrol-tinted) — task currently with the AI.
//   `[ ME ] <label>` (brand-tinted)  — task currently with the broker.
//
// Data: `useDealSecretary(loanId)` returns `{ left, right }` from desktop's
// 2-column workbench; we flatten them into one list. Order: human-owned
// first (the broker's queue), then AI-owned (so the broker can spot-check
// what the AI is on).

import { useMemo, useState } from "react";
import { ActivityIndicator, Pressable, Text, TextInput, View } from "react-native";
import { useTheme } from "@/design-system/ThemeProvider";
import { Card, Pill, SectionLabel } from "@/design-system/primitives";
import { Icon } from "@/design-system/Icon";
import { BottomSheet } from "@/components/sheets/BottomSheet";
import { AssignmentRow } from "@/components/agent/loan/AssignmentRow";
import { TaskDetailSheet } from "@/components/agent/loan/TaskDetailSheet";
import {
  useAIQuestions,
  useAnswerAIQuestion,
  useAssignTaskToAI,
  useDealSecretary,
  usePauseAISecretary,
  useStartAISecretary,
  useUnassignTaskFromAI,
} from "@/hooks/useApi";
import type { DSTaskRow } from "@/lib/types";
import type { AIQuestion } from "@/lib/mocks";

export function AISecretaryTab({ loanId }: { loanId: string }) {
  const { t } = useTheme();
  const { data: secretary, isLoading } = useDealSecretary(loanId);
  const { data: questions = [] } = useAIQuestions(loanId);
  const start = useStartAISecretary();
  const pause = usePauseAISecretary();
  const assignAI = useAssignTaskToAI();
  const assignHuman = useUnassignTaskFromAI();

  const [activeTask, setActiveTask] = useState<DSTaskRow | null>(null);
  const [questionsOpen, setQuestionsOpen] = useState(false);

  // Flatten the two-column desktop view: human first (broker's queue),
  // then AI (read-only "what the AI is handling").
  const tasks: DSTaskRow[] = useMemo(() => {
    if (!secretary) return [];
    return [...secretary.left, ...secretary.right];
  }, [secretary]);
  const openQuestions = questions.filter((q) => q.status === "open");

  const onAssignAI = (task: DSTaskRow) => {
    assignAI.mutate({ loanId, requirement_key: task.requirement_key });
  };
  const onAssignHuman = (task: DSTaskRow) => {
    assignHuman.mutate({ loanId, requirement_key: task.requirement_key });
  };

  return (
    <View style={{ gap: 12 }}>
      <Card pad={14}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <SectionLabel>Elara</SectionLabel>
          <View style={{ flexDirection: "row", gap: 6 }}>
            <Pressable
              onPress={() => start.mutate(loanId)}
              disabled={start.isPending}
              accessibilityLabel="Start Elara"
              style={({ pressed }) => ({
                paddingVertical: 6,
                paddingHorizontal: 10,
                borderRadius: 8,
                backgroundColor: pressed ? t.brandSoft : t.chip,
                flexDirection: "row",
                alignItems: "center",
                gap: 4,
              })}
            >
              <Icon name="play" size={11} color={t.ink} />
              <Text style={{ fontSize: 11.5, fontWeight: "700", color: t.ink }}>Start</Text>
            </Pressable>
            <Pressable
              onPress={() => pause.mutate(loanId)}
              disabled={pause.isPending}
              accessibilityLabel="Pause Elara"
              style={({ pressed }) => ({
                paddingVertical: 6,
                paddingHorizontal: 10,
                borderRadius: 8,
                backgroundColor: pressed ? t.warnBg : t.chip,
                flexDirection: "row",
                alignItems: "center",
                gap: 4,
              })}
            >
              <Icon name="pause" size={11} color={t.ink} />
              <Text style={{ fontSize: 11.5, fontWeight: "700", color: t.ink }}>Pause</Text>
            </Pressable>
          </View>
        </View>
        <Text style={{ fontSize: 12, color: t.ink3, marginTop: 4 }}>
          Swipe left to send to AI · swipe right to keep with you
        </Text>
        {openQuestions.length > 0 ? (
          <Pressable
            onPress={() => setQuestionsOpen(true)}
            accessibilityLabel="Open AI questions"
            style={({ pressed }) => ({
              marginTop: 10,
              padding: 10,
              borderRadius: 10,
              backgroundColor: pressed ? t.warnBg : t.warnBg,
              borderColor: t.warn,
              borderWidth: 1,
              flexDirection: "row",
              alignItems: "center",
              gap: 8,
            })}
          >
            <Icon name="alert" size={14} color={t.warn} />
            <Text style={{ flex: 1, fontSize: 12.5, fontWeight: "700", color: t.warn }}>
              {openQuestions.length} open AI question{openQuestions.length === 1 ? "" : "s"}
            </Text>
            <Icon name="chevR" size={12} color={t.warn} />
          </Pressable>
        ) : null}
      </Card>

      {isLoading ? (
        <Card pad={18}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <ActivityIndicator size="small" color={t.ink3} />
            <Text style={{ fontSize: 13, color: t.ink3 }}>Loading tasks…</Text>
          </View>
        </Card>
      ) : tasks.length === 0 ? (
        <Card pad={18}>
          <Text style={{ fontSize: 13, color: t.ink3 }}>
            Nothing on the secretary yet. Tasks will appear once the playbook resolves.
          </Text>
        </Card>
      ) : (
        <View style={{ gap: 8 }}>
          {tasks.map((task) => (
            <AssignmentRow
              key={task.requirement_key}
              task={task}
              onAssignAI={() => onAssignAI(task)}
              onAssignHuman={() => onAssignHuman(task)}
              onOpenDetail={() => setActiveTask(task)}
            />
          ))}
        </View>
      )}

      <TaskDetailSheet
        visible={!!activeTask}
        onClose={() => setActiveTask(null)}
        task={activeTask}
        onAssignAI={() => activeTask && onAssignAI(activeTask)}
        onAssignHuman={() => activeTask && onAssignHuman(activeTask)}
      />

      <AIQuestionsSheet
        visible={questionsOpen}
        onClose={() => setQuestionsOpen(false)}
        questions={questions}
        loanId={loanId}
      />
    </View>
  );
}

// Legacy AI-questions Q&A. Moved out of the main tab body and behind a
// chip so it doesn't crowd the swipe list when there are no open questions.
function AIQuestionsSheet({
  visible,
  onClose,
  questions,
  loanId,
}: {
  visible: boolean;
  onClose: () => void;
  questions: AIQuestion[];
  loanId: string;
}) {
  const { t } = useTheme();
  const answer = useAnswerAIQuestion();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const active = questions.find((q) => q.id === activeId) ?? null;

  const submit = async () => {
    if (!active || !draft.trim()) return;
    await answer.mutateAsync({ loanId, questionId: active.id, answer: draft.trim() });
    setActiveId(null);
    setDraft("");
  };

  return (
    <BottomSheet visible={visible} onClose={onClose} title="AI questions" subtitle={`${questions.length} total`}>
      {questions.length === 0 ? (
        <Text style={{ fontSize: 13, color: t.ink3 }}>No questions from the AI right now.</Text>
      ) : (
        questions.map((q, i) => (
          <View
            key={q.id}
            style={{
              padding: 12,
              borderRadius: 12,
              borderWidth: 1,
              borderColor: t.line,
              gap: 8,
              backgroundColor: t.surface,
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Pill
                bg={q.status === "answered" ? t.profitBg : t.warnBg}
                color={q.status === "answered" ? t.profit : t.warn}
              >
                {q.status}
              </Pill>
              <Text style={{ fontSize: 10.5, color: t.ink3 }}>
                {new Date(q.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
              </Text>
            </View>
            <Text style={{ fontSize: 13, color: t.ink, lineHeight: 18 }}>{q.body}</Text>
            {activeId === q.id ? (
              <View style={{ gap: 6 }}>
                <TextInput
                  value={draft}
                  onChangeText={setDraft}
                  multiline
                  placeholder="Your answer…"
                  placeholderTextColor={t.ink4}
                  style={{
                    minHeight: 80,
                    padding: 10,
                    borderRadius: 8,
                    backgroundColor: t.surface2,
                    borderColor: t.line,
                    borderWidth: 1,
                    color: t.ink,
                    fontSize: 13,
                    textAlignVertical: "top",
                  }}
                />
                <Pressable
                  onPress={submit}
                  disabled={!draft.trim() || answer.isPending}
                  accessibilityLabel="Send answer"
                  style={({ pressed }) => ({
                    alignSelf: "flex-end",
                    paddingHorizontal: 12,
                    paddingVertical: 7,
                    borderRadius: 8,
                    backgroundColor: draft.trim() ? t.brand : t.chip,
                    opacity: pressed ? 0.85 : 1,
                  })}
                >
                  {answer.isPending ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text style={{ color: draft.trim() ? "#fff" : t.ink3, fontWeight: "700", fontSize: 12.5 }}>
                      Send
                    </Text>
                  )}
                </Pressable>
              </View>
            ) : q.status === "open" ? (
              <Pressable
                onPress={() => {
                  setActiveId(q.id);
                  setDraft(q.answered_body ?? "");
                }}
                accessibilityLabel="Answer this question"
                style={({ pressed }) => ({
                  alignSelf: "flex-start",
                  paddingHorizontal: 10,
                  paddingVertical: 6,
                  borderRadius: 8,
                  backgroundColor: pressed ? t.brandSoft : t.chip,
                })}
              >
                <Text style={{ fontSize: 12, fontWeight: "700", color: t.ink }}>Answer</Text>
              </Pressable>
            ) : null}
          </View>
        ))
      )}
    </BottomSheet>
  );
}
