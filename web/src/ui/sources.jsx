// 출처·라이선스 drawer (13, Part 10): generated from
// ../sources.js. The long credit line leaves the canvas; one small
// link opens this. SSR-safe.
import { Badge } from "@astryxdesign/core/Badge";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { Heading } from "@astryxdesign/core/Heading";
import { HStack } from "@astryxdesign/core/HStack";
import { VStack } from "@astryxdesign/core/VStack";
import { Text } from "@astryxdesign/core/Text";
import { SOURCES } from "../sources.js";

export function SourcesDrawer({ onClose }) {
  return (
    <Card padding={3}>
      <VStack gap={2}>
        <HStack gap={1} vAlign="center">
          <Heading level={4}>출처·라이선스</Heading>
          <span style={{ flex: 1 }} />
          {onClose && <Button size="sm" variant="ghost" label="닫기" onClick={onClose} />}
        </HStack>
        <VStack gap={0}>
          {SOURCES.map((s) => (
            <div key={s.id} className="ui-src-row">
              <HStack gap={1} vAlign="center">
                <Text><strong>{s.name}</strong></Text>
                <Badge variant="neutral" label={s.licence} />
              </HStack>
              <Text type="supporting">{s.use}</Text>
              <Text type="supporting">{s.version}</Text>
              <Text type="supporting">
                <a href={s.url} target="_blank" rel="noreferrer">공식 출처 ↗</a>
              </Text>
              <Text type="supporting">{`하지 말 것: ${s.mustNot}`}</Text>
            </div>
          ))}
        </VStack>
      </VStack>
    </Card>
  );
}
