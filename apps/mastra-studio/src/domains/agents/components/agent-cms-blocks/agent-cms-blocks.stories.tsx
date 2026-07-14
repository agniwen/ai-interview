import { TooltipProvider } from "@mastra/playground-ui/components/Tooltip";
import type { JsonSchema } from "@mastra/playground-ui/utils/json-schema";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";

import { createInstructionBlock } from "../agent-edit-page/utils/form-validation";
import type { InstructionBlock } from "../agent-edit-page/utils/form-validation";
import { AgentCMSBlocks } from "./agent-cms-blocks";

const meta: Meta<typeof AgentCMSBlocks> = {
  component: AgentCMSBlocks,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
  title: "Domain/Agents/AgentCMSBlocks",
};

export default meta;
type Story = StoryObj<typeof AgentCMSBlocks>;

const complexSchema: JsonSchema = {
  properties: {
    metadata: {
      properties: {
        createdAt: { title: "Created At", type: "string" },
        updatedAt: { title: "Updated At", type: "string" },
        version: { title: "Version", type: "number" },
      },
      title: "Metadata",
      type: "object",
    },
    user: {
      properties: {
        address: {
          properties: {
            city: { title: "City", type: "string" },
            country: { title: "Country", type: "string" },
            street: { title: "Street", type: "string" },
            zipCode: { title: "Zip Code", type: "string" },
          },
          title: "Address",
          type: "object",
        },
        email: { title: "Email", type: "string" },
        roles: {
          items: {
            properties: {
              name: { title: "Role Name", type: "string" },
              permissions: { title: "Permissions", type: "string" },
            },
            type: "object",
          },
          title: "Roles",
          type: "array",
        },
      },
      title: "User",
      type: "object",
    },
  },
  type: "object",
};

const InteractiveExample = () => {
  const [items, setItems] = useState<InstructionBlock[]>([
    createInstructionBlock("You are a helpful assistant that answers questions about programming."),
    createInstructionBlock("Always be polite and professional in your responses."),
  ]);

  return (
    <div className="w-[800px]">
      <TooltipProvider>
        <AgentCMSBlocks
          items={items}
          onChange={setItems}
          placeholder="Enter content..."
          schema={complexSchema}
        />
      </TooltipProvider>

      <div className="mt-4 p-3 bg-surface2 rounded-lg">
        <p className="text-xs text-neutral3 mb-2">Current state:</p>
        <pre className="text-xs text-neutral6 whitespace-pre-wrap">
          {JSON.stringify(items, null, 2)}
        </pre>
      </div>
    </div>
  );
};

export const Default: Story = {
  render: () => <InteractiveExample />,
};

const EmptyExample = () => {
  const [items, setItems] = useState<InstructionBlock[]>([]);

  return (
    <div className="w-[500px]">
      <TooltipProvider>
        <AgentCMSBlocks
          items={items}
          onChange={setItems}
          placeholder="Add your first content block..."
          schema={complexSchema}
        />
      </TooltipProvider>
    </div>
  );
};

export const Empty: Story = {
  render: () => <EmptyExample />,
};

const SingleBlockExample = () => {
  const [items, setItems] = useState<InstructionBlock[]>([
    createInstructionBlock("Single content block with some text."),
  ]);

  return (
    <div className="w-[500px]">
      <TooltipProvider>
        <AgentCMSBlocks
          items={items}
          onChange={setItems}
          placeholder="Enter content..."
          schema={complexSchema}
        />
      </TooltipProvider>
    </div>
  );
};

export const SingleBlock: Story = {
  render: () => <SingleBlockExample />,
};
