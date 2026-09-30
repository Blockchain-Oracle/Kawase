// Native twin: React Native Reusables (Uniwind) components, styled only by the shared tokens.
import { View } from 'react-native';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Text } from '@/components/ui/text';
import { cn } from '@/lib/utils';

import type { TransferReceiptSpec } from './card-spec';

type Props = { spec: TransferReceiptSpec; onAction: (id: string) => void };

export function TransferCard({ spec, onAction }: Props) {
  return (
    <Card className="w-full max-w-sm">
      <CardHeader className="gap-3">
        <Badge className="bg-network-surface self-start border-transparent">
          <Text className="text-network">{spec.networkLabel}</Text>
        </Badge>
        <CardTitle className="text-start text-xl">{spec.title}</CardTitle>
      </CardHeader>
      <CardContent className="gap-3">
        {spec.rows.map((row, index) => (
          <View
            key={row.label}
            className={cn(
              'border-border flex-row items-center justify-between pb-3',
              index < spec.rows.length - 1 && 'border-b'
            )}>
            <Text className="text-muted-foreground text-sm">{row.label}</Text>
            <Text className={cn('text-sm', row.emphasis && 'text-lg font-bold')}>{row.value}</Text>
          </View>
        ))}
      </CardContent>
      <CardFooter>
        <Button className="bg-network w-full" onPress={() => onAction(spec.action.id)}>
          <Text className="text-network-foreground">{spec.action.label}</Text>
        </Button>
      </CardFooter>
    </Card>
  );
}
